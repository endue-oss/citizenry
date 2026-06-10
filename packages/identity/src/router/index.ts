import { Hono, type Context } from 'hono'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import type { Db } from '../db'
import { AuthError, type TokenPayload } from '../auth'
import { agentDid } from '../ids'
import { bytesToBase64url } from '../jose'
import { createMeService, type MeService } from '../service/me'
import { createJwksService, type JwksService } from '../service/jwks'
import { createDidService, type DidService } from '../service/did'
import {
  mountPublicFederationRoutes,
  type FederationVars,
} from './federation'

export type IdentityRouterVars = {
  db: Db
  /** `did:web:{issuerHost}` builder host — injected by the app. */
  issuerHost: string
  /** Allowed JWT audiences — injected by the app. */
  audience: string[]
  /** Mint key id (`kid_<ULID>`) — injected by the app. */
  mintKid: () => string
  /** Set by the app's bearer-JWT middleware on authenticated routes. */
  agentJwtPayload?: TokenPayload
  /** Test seams — when absent, services are built over `db`. */
  me?: MeService
  jwks?: JwksService
  did?: DidService
} & Partial<FederationVars>

type Env = { Variables: IdentityRouterVars }

const meSvc = (c: Context<Env>): MeService =>
  c.var.me ??
  createMeService({
    db: c.var.db,
    audience: c.var.audience,
    mintKid: c.var.mintKid,
  })

const jwksSvc = (c: Context<Env>): JwksService =>
  c.var.jwks ?? createJwksService({ db: c.var.db })

const didSvc = (c: Context<Env>): DidService =>
  c.var.did ?? createDidService({ db: c.var.db, issuerHost: c.var.issuerHost })

// HTTP status per identity error code (docs/reference/error-codes/*).
const STATUS_BY_CODE: Record<string, 400 | 401 | 404 | 409 | 422 | 500> = {
  [IDENTITY_ERR.bad_request]: 400,
  [IDENTITY_ERR.unauthorized]: 401,
  [IDENTITY_ERR.jwt_alg_mismatch]: 401,
  [IDENTITY_ERR.jwt_aud_mismatch]: 401,
  [IDENTITY_ERR.jwt_expired]: 401,
  [IDENTITY_ERR.jwt_kid_unknown]: 401,
  [IDENTITY_ERR.jws_replay]: 401,
  [IDENTITY_ERR.jws_action_mismatch]: 401,
  [IDENTITY_ERR.jws_lifetime_exceeded]: 401,
  [IDENTITY_ERR.not_found]: 404,
  [IDENTITY_ERR.key_not_active]: 409,
  [IDENTITY_ERR.agent_revoked]: 409,
  [IDENTITY_ERR.jwk_invalid]: 422,
  [IDENTITY_ERR.internal]: 500,
}

const TITLE_BY_STATUS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable',
  500: 'Internal Server Error',
}

function errEnvelope(c: Context<Env>, err: AuthError) {
  const status = STATUS_BY_CODE[err.code] ?? 500
  return c.json(
    {
      title: TITLE_BY_STATUS[status] ?? 'Internal Server Error',
      message: err.message,
      code: err.code,
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    status,
  )
}

const badRequest = (c: Context<Env>, message: string) =>
  errEnvelope(c, new AuthError(IDENTITY_ERR.bad_request, message))

/** Parse a `{ "jws": "<compact JWS>" }` body; null on any shape problem. */
async function readJwsBody(c: Context<Env>): Promise<string | null> {
  let body: { jws?: unknown }
  try {
    body = (await c.req.json()) as { jws?: unknown }
  } catch {
    return null
  }
  return typeof body.jws === 'string' && body.jws.length > 0 ? body.jws : null
}

/**
 * User-facing identity router.
 *
 * Routes (mirror the reference spec — exposed as-is when mounted at root):
 *   GET    /v1/agent/me            (Bearer self-signed JWT — verified by the app middleware)
 *   POST   /v1/agent/me/rotate-key (body JWS, signed by the old key)
 *   DELETE /v1/agent/me            (body JWS, signed by the current key)
 *   GET    /.well-known/jwks.json      (public, no auth — federation/instance only, see ADR-2026-0003)
 *   GET    /.well-known/did.json       (public, no auth)
 *   GET    /agent/:id/jwks.json        (public, no auth)
 *   GET    /agent/:id/did.json         (public, no auth)
 *
 * Note: POST /v1/agent/register moved to `registerRouter` (Bearer chk_).
 */
export const identityRouter = new Hono<Env>()
  // ── /me self-service ─────────────────────────────────
  .get('/v1/agent/me', async (c) => {
    const payload = c.var.agentJwtPayload
    if (!payload) {
      return errEnvelope(c, new AuthError(IDENTITY_ERR.unauthorized, 'agent JWT required'))
    }
    try {
      const who = await meSvc(c).whoami(payload.sub)
      return c.json({
        id: who.agent.principalId,
        slug: who.agent.slug,
        display_name: who.agent.displayName ?? undefined,
        public_key_b64: bytesToBase64url(who.sigKey.publicKey),
        status: who.agent.status,
        tenant: who.tenantSlug,
        did: agentDid(c.var.issuerHost, who.agent.principalId),
        owner_human_principal_id: who.agent.ownerHumanPrincipalId,
        created_at: who.agent.createdAt.toISOString(),
        updated_at: who.agent.updatedAt.toISOString(),
      })
    } catch (err) {
      if (err instanceof AuthError) return errEnvelope(c, err)
      throw err
    }
  })
  .post('/v1/agent/me/rotate-key', async (c) => {
    const jws = await readJwsBody(c)
    if (!jws) return badRequest(c, 'body must be JSON with a non-empty "jws" string')
    try {
      const r = await meSvc(c).rotateKey(jws)
      return c.json({
        prev_kid: r.prevKid,
        new_kid: r.newKid,
        rotated_until: r.rotatedUntil.toISOString(),
      })
    } catch (err) {
      if (err instanceof AuthError) return errEnvelope(c, err)
      throw err
    }
  })
  .delete('/v1/agent/me', async (c) => {
    const jws = await readJwsBody(c)
    if (!jws) return badRequest(c, 'body must be JSON with a non-empty "jws" string')
    try {
      await meSvc(c).selfRevoke(jws)
      return c.body(null, 204)
    } catch (err) {
      if (err instanceof AuthError) return errEnvelope(c, err)
      throw err
    }
  })

  // ── Public well-known (issuer) ───────────────────────
  // /.well-known/jwks.json carries the instance-level federation-signing key set
  // (RFC-0001 federation peers verify handshake JWS against this). It NEVER contains
  // per-agent keys — agent verification uses /agent/{iss}/jwks.json (ADR-2026-0003).
  // Returns an empty set until the federation key issuance work lands.
  .get('/.well-known/jwks.json', (c) => c.json({ keys: [] }))
  .get('/.well-known/did.json', async (c) => c.json(await didSvc(c).issuer()))

  // ── Public well-known (per agent) ─────────────────────
  // Discovery surface: an unknown or revoked agent id yields an empty
  // key set / method-less document rather than a 404, so the route does
  // not oracle which ids exist beyond what verification already reveals.
  .get('/agent/:id/jwks.json', async (c) =>
    c.json(await jwksSvc(c).agent(c.req.param('id'))),
  )
  .get('/agent/:id/did.json', async (c) =>
    c.json(await didSvc(c).agent(c.req.param('id'))),
  )

// ── Federation public surface (RFC-0001) ──────────────────
//   GET  /.well-known/citizenry-peer
//   POST /federation/handshake
// Routes expect a c.var.federation service instance — injected by apps/api middleware.
mountPublicFederationRoutes(identityRouter as unknown as Hono<{ Variables: FederationVars }>)
