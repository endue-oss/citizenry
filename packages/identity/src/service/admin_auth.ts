// Admin authentication primitives.
//
// Shape: pure functions over the supplied refresh-token repo and a
// `getAdminPassword` callback that returns the current plaintext
// password. The actual storage of the password lives in packages/config
// (D1 key `admin.password`) — this service does not know or care where
// the string comes from, so the identity package stays decoupled from
// the config package.
//
// Why plaintext (not PBKDF2): the operator already holds Cloudflare
// credentials with read access to the same D1 instance the worker uses,
// so any breach that reads a hash can equally re-deploy the worker.
// In exchange we get a much simpler delivery story for public-fork
// adopters: the auto-generated password lands in the config DB, the
// operator reads it via `wrangler d1 execute`, and nothing crosses CI
// logs.
//
// Refresh token shape:
//   - Raw token presented to clients: 48 random bytes, base64url-encoded.
//   - Server stores SHA-256 over (pepper || raw) in `token_hash`.
//   - On refresh, the presented token is hashed and matched. If the
//     row's `revoked_at` is not null, or `replaced_by` is set, the
//     server treats it as a replay and revokes the entire chain for
//     that admin.

import type { Db } from '../db'
import {
  createAdminRefreshTokenRepo,
  type AdminRefreshTokenRepo,
} from '../repo/admin_refresh_token'
import type { AdminRefreshTokenRow } from '../db/schema'

const REFRESH_TOKEN_BYTES = 48

export type AdminAuthError =
  | 'invalid_credentials'
  | 'invalid_refresh_token'
  | 'refresh_replay_detected'
  | 'refresh_expired'

export class AdminAuthErrorResult extends Error {
  constructor(public readonly kind: AdminAuthError) {
    super(kind)
    this.name = 'AdminAuthErrorResult'
  }
}

// ── byte helpers ──────────────────────────────────────────────

const randomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

const toBase64Url = (b: Uint8Array): string => {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const constantTimeEqualStrings = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── refresh token hashing ─────────────────────────────────────

const RAW_TOKEN_PREFIX = 'rfsh_'

async function refreshTokenHash(
  rawWithoutPrefix: string,
  pepper: Uint8Array,
): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(rawWithoutPrefix)
  const combined = new Uint8Array(pepper.length + enc.length)
  combined.set(pepper, 0)
  combined.set(enc, pepper.length)
  const out = await crypto.subtle.digest('SHA-256', combined)
  return new Uint8Array(out)
}

// ── token id ──────────────────────────────────────────────────
// Lightweight ULID-ish id: 48-bit ms timestamp + 80-bit random,
// Crockford base32. Keeps issued ids sortable by creation time and
// matches the existing `<prefix>_<26char>` pattern.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function ulid(): string {
  const now = Date.now()
  const time = new Uint8Array(6)
  let n = now
  for (let i = 5; i >= 0; i--) {
    time[i] = n & 0xff
    n = Math.floor(n / 256)
  }
  const rand = randomBytes(10)
  const bytes = new Uint8Array(16)
  bytes.set(time, 0)
  bytes.set(rand, 6)

  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD[(buffer >>> bits) & 0x1f]
    }
  }
  if (bits > 0) out += CROCKFORD[(buffer << (5 - bits)) & 0x1f]
  return out.slice(0, 26)
}

const newRefreshTokenId = () => `art_${ulid()}`

// ── service ───────────────────────────────────────────────────

export type AdminAuthDeps = {
  /** Either a Db (used to build the refresh-token repo) or a pre-built
   *  repo for tests. */
  db?: Db
  tokens?: AdminRefreshTokenRepo
  /** Admin id this service authenticates. Compared to the request's
   *  admin_id field; mismatches return invalid_credentials. */
  adminId: string
  /** Returns the current admin password plaintext (or null if not yet
   *  provisioned). Typically backed by packages/config's cached
   *  reader. */
  getAdminPassword: () => Promise<string | null>
  refreshPepper: Uint8Array
  /** Defaults to 30 days. */
  refreshTtlMs?: number
  /** Injectable clock — defaults to Date.now(). */
  now?: () => number
  /** Injectable raw-token generator — defaults to 48 random bytes. */
  randomTokenBytes?: () => Uint8Array
}

export type AdminLoginResult = {
  adminId: string
  refreshToken: string
  refreshTokenRow: AdminRefreshTokenRow
}

export type AdminRefreshResult = {
  adminId: string
  refreshToken: string
  refreshTokenRow: AdminRefreshTokenRow
  previousId: string
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>

export const createAdminAuthService = (deps: AdminAuthDeps) => {
  const tokens =
    deps.tokens ??
    (() => {
      if (!deps.db) throw new Error('createAdminAuthService: db or tokens required')
      return createAdminRefreshTokenRepo(deps.db)
    })()
  const refreshTtlMs = deps.refreshTtlMs ?? 30 * 24 * 60 * 60 * 1000
  const now = deps.now ?? Date.now
  const randomToken = deps.randomTokenBytes ?? (() => randomBytes(REFRESH_TOKEN_BYTES))

  async function issueRefreshToken(adminId: string): Promise<{
    raw: string
    row: AdminRefreshTokenRow
  }> {
    const raw = toBase64Url(randomToken())
    const hash = await refreshTokenHash(raw, deps.refreshPepper)
    const row = await tokens.insert({
      adminRefreshTokenId: newRefreshTokenId(),
      tokenHash: hash,
      adminId,
      expiresAt: new Date(now() + refreshTtlMs),
    })
    if (!row) {
      throw new Error('refresh token insert returned no row')
    }
    return { raw: `${RAW_TOKEN_PREFIX}${raw}`, row }
  }

  return {
    /**
     * Verify credentials against the config-backed password. Returns
     * the admin id and a fresh refresh-token row. The caller mints the
     * access token (JWT) on top — that keeps the JWT secret out of
     * this package.
     */
    async login(input: {
      adminId: string
      password: string
    }): Promise<AdminLoginResult> {
      // Mismatched admin_id collapses into the same "invalid_credentials"
      // bucket as a wrong password — no admin-id enumeration oracle.
      if (input.adminId !== deps.adminId) {
        throw new AdminAuthErrorResult('invalid_credentials')
      }
      const stored = await deps.getAdminPassword()
      if (stored === null) {
        // No admin password provisioned — treat as bad credential
        // rather than a different error so we don't leak setup state.
        throw new AdminAuthErrorResult('invalid_credentials')
      }
      if (!constantTimeEqualStrings(input.password, stored)) {
        throw new AdminAuthErrorResult('invalid_credentials')
      }
      const issued = await issueRefreshToken(deps.adminId)
      return {
        adminId: deps.adminId,
        refreshToken: issued.raw,
        refreshTokenRow: issued.row,
      }
    },

    /**
     * Rotate a refresh token. Returns the new pair (raw token + row)
     * plus the previous id (so the caller can include it in an audit
     * event). Replay or expiry throws `AdminAuthErrorResult`.
     */
    async refresh(rawToken: string): Promise<AdminRefreshResult> {
      if (!rawToken.startsWith(RAW_TOKEN_PREFIX)) {
        throw new AdminAuthErrorResult('invalid_refresh_token')
      }
      const stripped = rawToken.slice(RAW_TOKEN_PREFIX.length)
      const hash = await refreshTokenHash(stripped, deps.refreshPepper)
      const existing = await tokens.findByHash(hash)
      if (!existing) {
        throw new AdminAuthErrorResult('invalid_refresh_token')
      }
      if (existing.expiresAt.getTime() <= now()) {
        throw new AdminAuthErrorResult('refresh_expired')
      }
      if (existing.revokedAt || existing.replacedBy) {
        // Replay: if a refresh token that was already rotated is
        // presented, every outstanding token for this admin is
        // revoked — the safer side of the trade-off.
        await tokens.revokeAllForAdmin(existing.adminId, new Date(now()))
        throw new AdminAuthErrorResult('refresh_replay_detected')
      }
      const issued = await issueRefreshToken(existing.adminId)
      await tokens.rotate({
        id: existing.adminRefreshTokenId,
        replacedBy: issued.row.adminRefreshTokenId,
        revokedAt: new Date(now()),
      })
      return {
        adminId: existing.adminId,
        refreshToken: issued.raw,
        refreshTokenRow: issued.row,
        previousId: existing.adminRefreshTokenId,
      }
    },

    /** Revoke a single refresh token. Idempotent. */
    async revoke(rawToken: string): Promise<{ revoked: boolean }> {
      if (!rawToken.startsWith(RAW_TOKEN_PREFIX)) return { revoked: false }
      const stripped = rawToken.slice(RAW_TOKEN_PREFIX.length)
      const hash = await refreshTokenHash(stripped, deps.refreshPepper)
      const row = await tokens.findByHash(hash)
      if (!row || row.revokedAt) return { revoked: false }
      await tokens.revoke(row.adminRefreshTokenId, new Date(now()))
      return { revoked: true }
    },
  }
}
