// Bearer auth verifier surface. Other packages (apps/api, vault, etc.)
// import it as `@citizenry/identity/auth` — no router/repo/db dependency.

import { eq, inArray, and } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { agent as agentTable, agentKey as agentKeyTable } from './db/schema'
import type { Schema } from './db/schema'

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

export type AuthErrorCode =
  | 'ERR-P01-S01-1001' // jwt_alg_mismatch
  | 'ERR-P01-S01-1002' // jwt_aud_mismatch
  | 'ERR-P01-S01-1003' // jwt_expired
  | 'ERR-P01-S01-1004' // jwt_kid_unknown
  | 'ERR-P01-S01-1030' // enrollment_token_invalid
  | 'ERR-P01-S01-0401' // unauthorized (generic)

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
    throw new AuthError('ERR-P01-S01-0401', 'TokenVerifier not configured')
  },
})

const base64urlToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const base64urlToString = (s: string): string =>
  new TextDecoder().decode(base64urlToBytes(s))

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
 *  3. header.kid → agent_key lookup (status ∈ active|rotated)
 *  4. payload.iss === payload.sub === key.agent_id
 *  5. payload.aud ∩ options.audience ≠ ∅
 *  6. payload.exp > now
 *  7. Ed25519.verify(public_key, signature, signing_input)
 */
export const verifyAgentJwt = async (
  db: DrizzleD1Database<Schema>,
  token: string,
  opts: VerifyJwtOptions,
): Promise<TokenPayload> => {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new AuthError('ERR-P01-S01-0401', 'malformed compact JWS')
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
    throw new AuthError('ERR-P01-S01-0401', 'JWT header/payload not valid JSON')
  }

  if (header.alg !== 'EdDSA') {
    throw new AuthError('ERR-P01-S01-1001', `unexpected alg: ${header.alg}`)
  }
  if (!header.kid) {
    throw new AuthError('ERR-P01-S01-1004', 'header.kid missing')
  }

  // kid → agent_key lookup
  const keyRows = await db
    .select()
    .from(agentKeyTable)
    .where(
      and(
        eq(agentKeyTable.kid, header.kid),
        inArray(agentKeyTable.status, ['active', 'rotated']),
      ),
    )
    .limit(1)
  const key = keyRows[0]
  if (!key) {
    throw new AuthError('ERR-P01-S01-1004', 'kid unknown or revoked')
  }

  // self-signed claim sanity
  if (!payload.sub || !payload.iss || payload.iss !== payload.sub) {
    throw new AuthError('ERR-P01-S01-0401', 'iss must equal sub (self-signed)')
  }
  if (payload.sub !== key.agentId) {
    throw new AuthError('ERR-P01-S01-0401', 'sub does not match key.agent_id')
  }

  // aud
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : []
  const audOk = auds.some((a) => opts.audience.includes(a))
  if (!audOk) {
    throw new AuthError('ERR-P01-S01-1002', 'aud does not match allowed audiences')
  }

  // exp
  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp <= now) {
    throw new AuthError('ERR-P01-S01-1003', 'JWT expired')
  }

  // Ed25519 verify
  const signingInput = new TextEncoder().encode(`${h64}.${p64}`)
  const signature = base64urlToBytes(s64)
  const publicKey = await crypto.subtle.importKey(
    'raw',
    key.publicKey,
    { name: 'Ed25519' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify('Ed25519', publicKey, signature, signingInput)
  if (!ok) {
    throw new AuthError('ERR-P01-S01-0401', 'signature verification failed')
  }

  // confirm agent is not revoked
  const agentRows = await db
    .select()
    .from(agentTable)
    .where(eq(agentTable.principalId, key.agentId))
    .limit(1)
  const agentRow = agentRows[0]
  if (!agentRow || agentRow.status !== 'active') {
    throw new AuthError('ERR-P01-S01-0401', 'agent not active')
  }

  return payload
}

/**
 * Enrollment Bearer token shape check — actual hash compare / atomic decrement
 * happens in the `/v1/agent/register` handler. Middleware only checks the prefix.
 */
export const checkEnrollmentBearerShape = (token: string): void => {
  if (!/^eret_[A-Za-z0-9]{32,}$/.test(token)) {
    throw new AuthError('ERR-P01-S01-1030', 'enrollment token shape invalid')
  }
}
