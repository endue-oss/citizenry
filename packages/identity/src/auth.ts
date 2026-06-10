// Bearer auth verifier surface. Other packages (apps/api, vault, etc.)
// import it as `@citizenry/identity/auth` — no router/repo/db dependency.

import { eq, inArray, and } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { IDENTITY_ERR, type IdentityErrorCodeValue } from '@citizenry/spec/error-codes/identity'
import { agent as agentTable, agentKey as agentKeyTable } from './db/schema'
import type { Schema } from './db/schema'
import { base64urlToBytes, base64urlToString, verifyEd25519 } from './jose'

export interface TokenPayload {
  /** Subject — agent_id */
  sub: string
  /** Issuer — equal to `sub` (self-signed) */
  iss: string
  /** Audience */
  aud: string | string[]
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
  /** Key ID — matches header.kid */
  kid: string
  /** JWT ID (optional, replay protection) */
  jti?: string
}

/**
 * The subset of identity error codes that the auth verifier can emit.
 * Pulled from the generated `IDENTITY_ERR` catalog so the .tsp source of
 * truth (`packages/spec/identity/errors.tsp`) drives this surface too.
 */
export type AuthErrorCode = IdentityErrorCodeValue

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export interface TokenVerifier {
  /** EdDSA JWT verify → returns payload. Throws on failure. */
  verifyJwt(token: string): Promise<TokenPayload>
}

/**
 * Noop verifier — dependency-injection placeholder. Use `verifyAgentJwt` for real verification.
 */
export const createNoopVerifier = (): TokenVerifier => ({
  verifyJwt: async () => {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'TokenVerifier not configured')
  },
})

/**
 * Tolerated clock drift between the token minter and this verifier,
 * applied to `exp` checks (a token is accepted until `exp + leeway`).
 */
export const CLOCK_SKEW_LEEWAY_SEC = 60

/**
 * How long a `rotated` signing key keeps verifying bearer JWTs after
 * rotation. Implements the `rotated → revoked (after grace period)`
 * transition from the spec lazily: past the window the key is treated
 * as revoked at verify time — no cron required. The `rotated_until`
 * field in the rotate-key response is `rotated_at + this`.
 */
export const ROTATED_KEY_GRACE_SEC = 24 * 60 * 60

/**
 * Whether a rotated key is still inside its verification grace window.
 * Rows rotated before the `rotated_at` column existed (null) are
 * treated as past the window — fail closed.
 */
export const isRotatedKeyWithinGrace = (
  rotatedAt: Date | null | undefined,
  nowMs: number,
): boolean =>
  rotatedAt instanceof Date && rotatedAt.getTime() + ROTATED_KEY_GRACE_SEC * 1000 > nowMs

export interface VerifyJwtOptions {
  /** Allowed audience list (any one match, not all). */
  audience: string[]
}

/**
 * Self-signed Ed25519 JWT verification.
 *
 * Steps:
 *  1. parse compact JWS
 *  2. header.alg === "EdDSA"
 *  3. header.kid → agent_key lookup (use='sig', status ∈ active|rotated)
 *     — rotated keys only inside their grace window
 *  4. payload.iss === payload.sub === key.agent_id
 *  5. payload.aud ∩ options.audience ≠ ∅
 *  6. payload.exp + leeway > now
 *  7. Ed25519.verify(public_key, signature, signing_input)
 */
export const verifyAgentJwt = async (
  db: DrizzleD1Database<Schema>,
  token: string,
  opts: VerifyJwtOptions,
): Promise<TokenPayload> => {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'malformed compact JWS')
  }
  const h64 = parts[0]!
  const p64 = parts[1]!
  const s64 = parts[2]!

  let header: { alg?: string; kid?: string; typ?: string }
  let payload: TokenPayload
  try {
    header = JSON.parse(base64urlToString(h64))
    payload = JSON.parse(base64urlToString(p64))
  } catch {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'JWT header/payload not valid JSON')
  }

  if (header.alg !== 'EdDSA') {
    throw new AuthError(IDENTITY_ERR.jwt_alg_mismatch, `unexpected alg: ${header.alg}`)
  }
  if (!header.kid) {
    throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'header.kid missing')
  }

  // kid → agent_key lookup. Scoped to use='sig' so a JWT can never be
  // verified against an X25519 encryption key that shares the table.
  const keyRows = await db
    .select()
    .from(agentKeyTable)
    .where(
      and(
        eq(agentKeyTable.kid, header.kid),
        eq(agentKeyTable.use, 'sig'),
        inArray(agentKeyTable.status, ['active', 'rotated']),
      ),
    )
    .limit(1)
  const key = keyRows[0]
  if (!key) {
    throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'kid unknown or revoked')
  }
  if (key.status === 'rotated' && !isRotatedKeyWithinGrace(key.rotatedAt, Date.now())) {
    throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'kid rotated past its grace window')
  }

  // self-signed claim sanity
  if (!payload.sub || !payload.iss || payload.iss !== payload.sub) {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'iss must equal sub (self-signed)')
  }
  if (payload.sub !== key.agentId) {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'sub does not match key.agent_id')
  }

  // aud
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : []
  const audOk = auds.some((a) => opts.audience.includes(a))
  if (!audOk) {
    throw new AuthError(IDENTITY_ERR.jwt_aud_mismatch, 'aud does not match allowed audiences')
  }

  // exp (with clock-skew leeway)
  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp + CLOCK_SKEW_LEEWAY_SEC <= now) {
    throw new AuthError(IDENTITY_ERR.jwt_expired, 'JWT expired')
  }

  // Ed25519 verify
  const signingInput = new TextEncoder().encode(`${h64}.${p64}`)
  const signature = base64urlToBytes(s64)
  const ok = await verifyEd25519(key.publicKey, signature, signingInput)
  if (!ok) {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'signature verification failed')
  }

  // confirm agent is not revoked
  const agentRows = await db
    .select()
    .from(agentTable)
    .where(eq(agentTable.principalId, key.agentId))
    .limit(1)
  const agentRow = agentRows[0]
  if (!agentRow || agentRow.status !== 'active') {
    throw new AuthError(IDENTITY_ERR.unauthorized, 'agent not active')
  }

  return payload
}
