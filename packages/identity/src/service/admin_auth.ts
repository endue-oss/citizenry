// Admin authentication primitives.
//
// Shape: pure functions over a Db + the supplied secrets. JWT signing
// itself happens in apps/admin-api where the signing secret lives —
// this service is responsible only for the credential checks and the
// refresh-token registry.
//
// Password storage: PBKDF2-SHA-256, 32B salt, 32B output. Iterations
// are recorded per row so a future bump (e.g. 200k → 400k) can be
// transparent — verification reads the row's `iterations`, derivation
// of a new password (set or change) writes the current default.
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
  createAdminAccountRepo,
  type AdminAccountRepo,
} from '../repo/admin_account'
import {
  createAdminRefreshTokenRepo,
  type AdminRefreshTokenRepo,
} from '../repo/admin_refresh_token'
import type { AdminAccountRow, AdminRefreshTokenRow } from '../db/schema'

export const DEFAULT_PBKDF2_ITERATIONS = 200_000
const PBKDF2_HASH_BYTES = 32
const PBKDF2_SALT_BYTES = 32
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

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

// ── PBKDF2 ────────────────────────────────────────────────────

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    PBKDF2_HASH_BYTES * 8,
  )
  return new Uint8Array(bits)
}

/**
 * Derive a fresh password hash + salt at the current default
 * iteration count. Used both by `setPassword` and by the CI bootstrap
 * script (re-exported via `service` index for that purpose).
 */
export async function hashPassword(password: string): Promise<{
  passwordHash: Uint8Array
  passwordSalt: Uint8Array
  iterations: number
}> {
  const passwordSalt = randomBytes(PBKDF2_SALT_BYTES)
  const passwordHash = await pbkdf2(
    password,
    passwordSalt,
    DEFAULT_PBKDF2_ITERATIONS,
  )
  return { passwordHash, passwordSalt, iterations: DEFAULT_PBKDF2_ITERATIONS }
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
  /** Either a Db (used to build repos) or pre-built repos for tests. */
  db?: Db
  accounts?: AdminAccountRepo
  tokens?: AdminRefreshTokenRepo
  refreshPepper: Uint8Array
  /** Defaults to 30 days. */
  refreshTtlMs?: number
  /** Injectable clock — defaults to Date.now(). */
  now?: () => number
  /** Injectable raw-token generator — defaults to 48 random bytes. */
  randomTokenBytes?: () => Uint8Array
}

export type AdminLoginResult = {
  admin: AdminAccountRow
  refreshToken: string
  refreshTokenRow: AdminRefreshTokenRow
}

export type AdminRefreshResult = {
  admin: AdminAccountRow
  refreshToken: string
  refreshTokenRow: AdminRefreshTokenRow
  previousId: string
}

export type AdminAuthService = ReturnType<typeof createAdminAuthService>

export const createAdminAuthService = (deps: AdminAuthDeps) => {
  const accounts =
    deps.accounts ??
    (() => {
      if (!deps.db) throw new Error('createAdminAuthService: db or accounts required')
      return createAdminAccountRepo(deps.db)
    })()
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
     * Verify credentials. Returns the admin row + a fresh refresh
     * token row. Caller mints the access token (JWT) on top — that
     * keeps the JWT secret out of this package.
     */
    async login(input: {
      adminId: string
      password: string
    }): Promise<AdminLoginResult> {
      const admin = await accounts.findById(input.adminId)
      if (!admin) {
        // Same error for "no such admin" and "bad password" to avoid
        // an admin-id enumeration oracle.
        throw new AdminAuthErrorResult('invalid_credentials')
      }
      const presented = await pbkdf2(
        input.password,
        admin.passwordSalt,
        admin.iterations,
      )
      if (!constantTimeEqual(presented, admin.passwordHash)) {
        throw new AdminAuthErrorResult('invalid_credentials')
      }
      const issued = await issueRefreshToken(admin.adminId)
      return {
        admin,
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
      const admin = await accounts.findById(existing.adminId)
      if (!admin) {
        throw new AdminAuthErrorResult('invalid_refresh_token')
      }
      const issued = await issueRefreshToken(admin.adminId)
      await tokens.rotate({
        id: existing.adminRefreshTokenId,
        replacedBy: issued.row.adminRefreshTokenId,
        revokedAt: new Date(now()),
      })
      return {
        admin,
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

    /**
     * Write/replace the admin credential. Used by the CI bootstrap
     * path and by future "change password" flows.
     */
    async setPassword(input: {
      adminId: string
      password: string
    }): Promise<AdminAccountRow> {
      const hashed = await hashPassword(input.password)
      const row = await accounts.upsert({
        adminId: input.adminId,
        ...hashed,
      })
      if (!row) throw new Error('admin upsert returned no row')
      return row
    },

    /** Whether an admin account is provisioned (used by /_health). */
    async exists(adminId: string): Promise<boolean> {
      const row = await accounts.findById(adminId)
      return Boolean(row)
    },
  }
}
