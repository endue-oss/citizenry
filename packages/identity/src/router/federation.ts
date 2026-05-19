// Federation public routes + admin routes. The service instance is injected via
// c.var.federation (built by apps/api and apps/admin-api middleware).

import type { Context, Hono } from 'hono'
import type { Db } from '../db'
import type { FederationService } from '../service/federation'
import { FederationError } from '../service/federation/errors'
import type { FederationPeerState } from '../service/federation/types'

export type FederationVars = {
  db: Db
  federation: FederationService

  /** Our instance's self info — used in the discovery response. */
  selfIssuer: string
  selfInstanceId: string
  selfDisplayName?: string
  selfFederationJwksUrl: string
  selfFederationHandshakeUrl: string
  selfPolicies?: { auto_accept?: boolean; max_peers?: number }
}

type Env = { Variables: FederationVars }

/** FederationError → RFC 9457 envelope. */
const errorEnvelope = (c: Context, err: FederationError) => ({
  type: `https://citizenry.id/errors/${err.code}`,
  title: err.title,
  status: err.status,
  code: err.code,
  message: err.message,
  detail: err.detail,
  method: c.req.method,
  instance: c.req.path,
  request_url: c.req.url,
  timestamp: new Date().toISOString(),
})

const handle = async <T>(
  c: Context,
  fn: () => Promise<T>,
  okStatus: 200 | 201 = 200,
): Promise<Response> => {
  try {
    const out = await fn()
    if (out === undefined) return new Response(null, { status: 204 })
    return c.json(out as object, okStatus)
  } catch (e) {
    if (e instanceof FederationError) {
      return c.json(errorEnvelope(c, e), e.status as 400 | 401 | 404 | 409 | 422 | 500 | 502)
    }
    throw e
  }
}

const parseLimit = (v: string | undefined, def = 50, max = 200) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(1, Math.floor(n)))
}

const parsePage = (v: string | undefined) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

const STATES: ReadonlySet<FederationPeerState> = new Set([
  'invited',
  'pending',
  'trusted',
  'suspended',
  'revoked',
])

/** Mount the public-facing federation routes onto an existing Hono router. */
export const mountPublicFederationRoutes = <T extends Hono<Env>>(app: T): T => {
  // Public peer discovery — JSON, no auth, cache 5min.
  app.get('/.well-known/citizenry-peer', (c) =>
    c.json(
      {
        protocol_version: 1,
        issuer: c.var.selfIssuer,
        instance_id: c.var.selfInstanceId,
        display_name: c.var.selfDisplayName,
        federation_jwks_url: c.var.selfFederationJwksUrl,
        federation_handshake_url: c.var.selfFederationHandshakeUrl,
        policies: c.var.selfPolicies ?? { auto_accept: false, max_peers: 256 },
      },
      200,
      { 'cache-control': 'public, max-age=300' },
    ),
  )

  // Inbound handshake. Body is compact JWS (text). Auth via JWS signature.
  app.post('/federation/handshake', (c) =>
    handle(c, async () => {
      const ctype = c.req.header('content-type') ?? ''
      if (!ctype.startsWith('application/jws')) {
        return c.json(
          errorEnvelope(
            c,
            new FederationError({
              code: 'ERR-P01-FED-2001',
              status: 422,
              title: 'Invalid content-type',
              message: 'expected application/jws or application/jws+json',
            }),
          ),
          422,
        )
      }
      const compactJws = await c.req.text()
      const out = await c.var.federation.handleInbound(compactJws)
      return {
        state: out.state,
        instance_id: c.var.selfInstanceId,
        issuer: c.var.selfIssuer,
        ack_jws: out.ack_jws,
      }
    }),
  )

  return app
}

/** Mount the admin federation routes onto an existing Hono router. */
export const mountAdminFederationRoutes = <T extends Hono<Env>>(app: T): T => {
  app.post('/v1/admin/federation/peers', (c) =>
    handle(
      c,
      async () => {
        const body = (await c.req.json()) as {
          issuer_url: string
          display_name?: string
        }
        if (typeof body?.issuer_url !== 'string' || body.issuer_url.length === 0) {
          return c.json(
            errorEnvelope(
              c,
              new FederationError({
                code: 'ERR-P01-FED-2001',
                status: 422,
                title: 'Invalid issuer_url',
                message: 'issuer_url is required',
              }),
            ),
            422,
          )
        }
        return c.var.federation.addPeer(body)
      },
      201,
    ),
  )

  app.get('/v1/admin/federation/peers', (c) =>
    handle(c, async () => {
      const stateRaw = c.req.query('state')
      const state =
        stateRaw && STATES.has(stateRaw as FederationPeerState)
          ? (stateRaw as FederationPeerState)
          : undefined
      return c.var.federation.listPeers({
        state,
        page: parsePage(c.req.query('page')),
        limit: parseLimit(c.req.query('limit')),
      })
    }),
  )

  app.get('/v1/admin/federation/peers/:id', (c) =>
    handle(c, () => c.var.federation.getPeer(c.req.param('id'))),
  )

  app.post('/v1/admin/federation/peers/:id/transition', (c) =>
    handle(c, async () => {
      const body = (await c.req.json()) as { target_state: FederationPeerState }
      if (!body || !STATES.has(body.target_state)) {
        return c.json(
          errorEnvelope(
            c,
            new FederationError({
              code: 'ERR-P01-FED-2001',
              status: 422,
              title: 'Invalid target_state',
              message: 'target_state must be a FederationPeerState value',
            }),
          ),
          422,
        )
      }
      return c.var.federation.transitionPeer(c.req.param('id'), body.target_state)
    }),
  )

  app.delete('/v1/admin/federation/peers/:id', (c) =>
    handle(c, async () => {
      await c.var.federation.revokePeer(c.req.param('id'))
      return undefined
    }),
  )

  app.post('/v1/admin/federation/peers/:id/jwks-refresh', (c) =>
    handle(c, () => c.var.federation.refreshJwks(c.req.param('id'))),
  )

  return app
}
