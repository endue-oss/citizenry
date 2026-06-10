// Body-JWS verification for the /v1/agent/me self-service surface.
//
// A "body JWS" is the request body itself — a compact JWS signed with
// the agent's CURRENT ACTIVE signing key. The Authorization header is
// ignored on these routes; the body is the credential (spec:
// packages/spec/identity/me.tsp, common/jose.tsp `JwsPayloadBase`).
//
// Differences from the bearer-JWT path (`auth.ts` verifyAgentJwt):
//   - the signing key must be `active` — a rotated key may still verify
//     bearer JWTs during its grace window, but may NOT rotate or revoke
//   - `jti` is mandatory and single-use (replay protection)
//   - `action` must match the route intent
//   - `exp - iat` is bounded by MAX_BODY_JWS_LIFETIME_SEC

import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import type { Db } from '../db'
import type { AgentRow, AgentKeyRow } from '../db/schema'
import { createAgentKeyRepo } from '../repo/agent_key'
import { createAgentRepo } from '../repo/agent'
import { createJtiReplayRepo } from '../repo/jti_replay'
import {
  AuthError,
  CLOCK_SKEW_LEEWAY_SEC,
  verifyAgentJwt,
  type TokenPayload,
} from '../auth'
import { base64urlToBytes, parseCompactJws, verifyEd25519 } from '../jose'

/** Maximum accepted `exp - iat` for a body JWS (spec recommends ≤ 300s). */
export const MAX_BODY_JWS_LIFETIME_SEC = 300

export type BodyJwsAction = 'rotate-key' | 'revoke'

/** Decoded body-JWS payload (spec `JwsPayloadBase` + action envelope). */
export interface BodyJwsPayload {
  sub: string
  iss: string
  aud: string[]
  iat: number
  exp: number
  jti: string
  action: BodyJwsAction
  /** Action-specific inner payload — callers validate the shape. */
  payload: unknown
}

export interface VerifiedBodyJws {
  payload: BodyJwsPayload
  /** The active signing key that produced the JWS. */
  key: AgentKeyRow
  agent: AgentRow
}

/** Test seam — the default implementation hits the real D1 tables. */
export interface TokenServicePorts {
  /** kid → signing-key row (use='sig'), any status. */
  findSigKeyByKid(kid: string): Promise<AgentKeyRow | undefined>
  findAgentById(agentId: string): Promise<AgentRow | undefined>
  /** Single-use insert; false = jti already burned (replay). */
  claimJti(jti: string, expiresAt: Date): Promise<boolean>
}

const dbPorts = (db: Db): TokenServicePorts => {
  const keys = createAgentKeyRepo(db)
  const agents = createAgentRepo(db)
  const jti = createJtiReplayRepo(db)
  return {
    findSigKeyByKid: async (kid) => (await keys.findSigByKid(kid))[0],
    findAgentById: async (agentId) => (await agents.findById(agentId))[0],
    claimJti: async (id, expiresAt) => (await jti.claim(id, expiresAt)).length > 0,
  }
}

export type TokenService = ReturnType<typeof createTokenService>

export const createTokenService = (deps: {
  db: Db
  audience: string[]
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
  /** Inject for tests; defaults to D1-backed lookups over `db`. */
  ports?: TokenServicePorts
}) => {
  const now = deps.now ?? Date.now
  const ports = deps.ports ?? dbPorts(deps.db)

  return {
    /** Bearer-JWT verification — same semantics as the global middleware. */
    verifyJwt: (token: string): Promise<TokenPayload> =>
      verifyAgentJwt(deps.db, token, { audience: deps.audience }),

    verifyBodyJws: async (
      jws: string,
      expectedAction: BodyJwsAction,
    ): Promise<VerifiedBodyJws> => {
      const parsed = parseCompactJws(jws)
      if (!parsed) {
        throw new AuthError(IDENTITY_ERR.unauthorized, 'body must be a compact JWS')
      }

      const header = parsed.header as { alg?: unknown; kid?: unknown }
      if (header.alg !== 'EdDSA') {
        throw new AuthError(
          IDENTITY_ERR.jwt_alg_mismatch,
          `unexpected alg: ${String(header.alg)}`,
        )
      }
      if (typeof header.kid !== 'string' || header.kid.length === 0) {
        throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'header.kid missing')
      }

      const key = await ports.findSigKeyByKid(header.kid)
      if (!key) {
        throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'kid unknown')
      }
      if (key.status !== 'active') {
        // A rotated key may keep verifying bearer JWTs during its grace
        // window, but key-lifecycle changes demand the active key.
        throw new AuthError(IDENTITY_ERR.key_not_active, 'signing key is not active')
      }

      const p = parsed.payload as {
        sub?: unknown
        iss?: unknown
        aud?: unknown
        iat?: unknown
        exp?: unknown
        jti?: unknown
        action?: unknown
        payload?: unknown
      }

      if (typeof p.sub !== 'string' || typeof p.iss !== 'string' || p.iss !== p.sub) {
        throw new AuthError(IDENTITY_ERR.unauthorized, 'iss must equal sub (self-signed)')
      }
      if (p.sub !== key.agentId) {
        throw new AuthError(IDENTITY_ERR.unauthorized, 'sub does not match key.agent_id')
      }
      if (p.action !== expectedAction) {
        throw new AuthError(
          IDENTITY_ERR.jws_action_mismatch,
          `action must be "${expectedAction}"`,
        )
      }

      const auds = Array.isArray(p.aud)
        ? p.aud.filter((a): a is string => typeof a === 'string')
        : typeof p.aud === 'string'
          ? [p.aud]
          : []
      if (!auds.some((a) => deps.audience.includes(a))) {
        throw new AuthError(
          IDENTITY_ERR.jwt_aud_mismatch,
          'aud does not match allowed audiences',
        )
      }

      const nowSec = Math.floor(now() / 1000)
      if (typeof p.exp !== 'number' || p.exp + CLOCK_SKEW_LEEWAY_SEC <= nowSec) {
        throw new AuthError(IDENTITY_ERR.jwt_expired, 'JWS expired')
      }
      if (typeof p.iat !== 'number' || p.exp - p.iat > MAX_BODY_JWS_LIFETIME_SEC) {
        throw new AuthError(
          IDENTITY_ERR.jws_lifetime_exceeded,
          'JWS lifetime exceeds the allowed maximum',
        )
      }
      if (typeof p.jti !== 'string' || p.jti.length === 0) {
        throw new AuthError(IDENTITY_ERR.unauthorized, 'jti is required on a body JWS')
      }

      const signingInput = new TextEncoder().encode(`${parsed.h64}.${parsed.p64}`)
      const ok = await verifyEd25519(
        key.publicKey,
        base64urlToBytes(parsed.s64),
        signingInput,
      )
      if (!ok) {
        throw new AuthError(IDENTITY_ERR.unauthorized, 'signature verification failed')
      }

      const agentRow = await ports.findAgentById(key.agentId)
      if (!agentRow) {
        throw new AuthError(IDENTITY_ERR.not_found, 'agent not found')
      }
      if (agentRow.status !== 'active') {
        throw new AuthError(IDENTITY_ERR.agent_revoked, 'agent is revoked')
      }

      // Claim the jti only after the signature checked out, so an
      // attacker cannot burn a victim's jti with a garbage signature.
      const claimed = await ports.claimJti(p.jti, new Date(p.exp * 1000))
      if (!claimed) {
        throw new AuthError(IDENTITY_ERR.jws_replay, 'jti already used')
      }

      return {
        payload: {
          sub: p.sub,
          iss: p.iss,
          aud: auds,
          iat: p.iat,
          exp: p.exp,
          jti: p.jti,
          action: expectedAction,
          payload: p.payload,
        },
        key,
        agent: agentRow,
      }
    },
  }
}
