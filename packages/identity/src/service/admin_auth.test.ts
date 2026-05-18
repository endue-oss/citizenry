import { describe, expect, it } from 'vitest'
import type {
  AdminAccountRepo,
} from '../repo/admin_account'
import type {
  AdminRefreshTokenRepo,
} from '../repo/admin_refresh_token'
import type {
  AdminAccountRow,
  AdminRefreshTokenRow,
} from '../db/schema'
import {
  AdminAuthErrorResult,
  createAdminAuthService,
  hashPassword,
} from './admin_auth'

// ── fakes ─────────────────────────────────────────────
// In-memory repos that satisfy the same shapes as the drizzle-backed
// ones. Plenty for the tests below, which exercise login/refresh/
// rotation/replay/expiry — none of which touches D1-specific SQL.

function fakeAccountRepo(seed: AdminAccountRow[] = []): AdminAccountRepo {
  const rows = new Map(seed.map((r) => [r.adminId, r]))
  return {
    findById: async (id) => rows.get(id),
    upsert: async (input) => {
      const existing = rows.get(input.adminId)
      const row: AdminAccountRow = {
        adminId: input.adminId,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
        iterations: input.iterations,
        createdAt: existing?.createdAt ?? new Date(),
        updatedAt: new Date(),
      }
      rows.set(row.adminId, row)
      return row
    },
  }
}

function fakeRefreshRepo(): AdminRefreshTokenRepo & {
  rows: Map<string, AdminRefreshTokenRow>
} {
  const rows = new Map<string, AdminRefreshTokenRow>()
  const byHash = new Map<string, string>() // hex(hash) → id

  const hexOf = (h: Uint8Array) =>
    Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')

  return {
    rows,
    async findByHash(hash) {
      const id = byHash.get(hexOf(hash))
      return id ? rows.get(id) : undefined
    },
    async insert(input) {
      const row: AdminRefreshTokenRow = {
        adminRefreshTokenId: input.adminRefreshTokenId,
        tokenHash: input.tokenHash,
        adminId: input.adminId,
        expiresAt: input.expiresAt,
        revokedAt: null,
        replacedBy: null,
        createdAt: new Date(),
      }
      rows.set(row.adminRefreshTokenId, row)
      byHash.set(hexOf(row.tokenHash), row.adminRefreshTokenId)
      return row
    },
    async rotate({ id, replacedBy, revokedAt }) {
      const r = rows.get(id)
      if (!r) return undefined
      const updated = { ...r, replacedBy, revokedAt }
      rows.set(id, updated)
      return updated
    },
    async revoke(id, at) {
      const r = rows.get(id)
      if (!r || r.revokedAt) return []
      const updated = { ...r, revokedAt: at }
      rows.set(id, updated)
      return [updated]
    },
    async revokeAllForAdmin(adminId, at) {
      const out: AdminRefreshTokenRow[] = []
      for (const [id, r] of rows) {
        if (r.adminId === adminId && !r.revokedAt) {
          const updated = { ...r, revokedAt: at }
          rows.set(id, updated)
          out.push(updated)
        }
      }
      return out
    },
  }
}

const PEPPER = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

async function bootstrapAdmin(password: string): Promise<AdminAccountRow> {
  const hashed = await hashPassword(password)
  return {
    adminId: 'admin',
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
    iterations: hashed.iterations,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

describe('admin auth — password', () => {
  it('PBKDF2 round-trip authenticates the same password', async () => {
    const seed = await bootstrapAdmin('correct horse battery staple')
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    const result = await svc.login({
      adminId: 'admin',
      password: 'correct horse battery staple',
    })
    expect(result.admin.adminId).toBe('admin')
    expect(result.refreshToken.startsWith('rfsh_')).toBe(true)
    expect(result.refreshTokenRow.adminId).toBe('admin')
  })

  it('rejects the wrong password with invalid_credentials', async () => {
    const seed = await bootstrapAdmin('right one')
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    await expect(
      svc.login({ adminId: 'admin', password: 'wrong one' }),
    ).rejects.toMatchObject({ kind: 'invalid_credentials' })
  })

  it('rejects an unknown admin id with invalid_credentials (no enumeration)', async () => {
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    await expect(
      svc.login({ adminId: 'someone-else', password: 'x' }),
    ).rejects.toMatchObject({ kind: 'invalid_credentials' })
  })
})

describe('admin auth — refresh', () => {
  it('rotates: old row gets replacedBy + revokedAt, new row is fresh', async () => {
    const seed = await bootstrapAdmin('hunter2')
    const repo = fakeRefreshRepo()
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: repo,
      refreshPepper: PEPPER,
    })
    const first = await svc.login({ adminId: 'admin', password: 'hunter2' })
    const second = await svc.refresh(first.refreshToken)

    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(second.previousId).toBe(first.refreshTokenRow.adminRefreshTokenId)

    const old = repo.rows.get(first.refreshTokenRow.adminRefreshTokenId)
    expect(old?.replacedBy).toBe(second.refreshTokenRow.adminRefreshTokenId)
    expect(old?.revokedAt).toBeInstanceOf(Date)
  })

  it('detects replay: revokes the whole chain for that admin', async () => {
    const seed = await bootstrapAdmin('hunter2')
    const repo = fakeRefreshRepo()
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: repo,
      refreshPepper: PEPPER,
    })
    const first = await svc.login({ adminId: 'admin', password: 'hunter2' })
    await svc.refresh(first.refreshToken)
    // Re-using the original (already rotated) token must trip the replay guard.
    await expect(svc.refresh(first.refreshToken)).rejects.toMatchObject({
      kind: 'refresh_replay_detected',
    })
    // After replay, every outstanding row for this admin is revoked.
    for (const row of repo.rows.values()) {
      expect(row.revokedAt).toBeInstanceOf(Date)
    }
  })

  it('refuses an unknown refresh token', async () => {
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    await expect(svc.refresh('rfsh_doesnotexist')).rejects.toMatchObject({
      kind: 'invalid_refresh_token',
    })
  })

  it('refuses a refresh token without the rfsh_ prefix', async () => {
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    await expect(svc.refresh('foo_bar')).rejects.toMatchObject({
      kind: 'invalid_refresh_token',
    })
  })

  it('rejects an expired refresh token', async () => {
    const seed = await bootstrapAdmin('p')
    let t = 1_000_000_000
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
      refreshTtlMs: 1_000,
      now: () => t,
    })
    const issued = await svc.login({ adminId: 'admin', password: 'p' })
    t += 2_000 // step past the TTL
    await expect(svc.refresh(issued.refreshToken)).rejects.toMatchObject({
      kind: 'refresh_expired',
    })
  })
})

describe('admin auth — revoke (logout)', () => {
  it('revoke() flips revokedAt for the matched row', async () => {
    const seed = await bootstrapAdmin('p')
    const repo = fakeRefreshRepo()
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: repo,
      refreshPepper: PEPPER,
    })
    const first = await svc.login({ adminId: 'admin', password: 'p' })
    const result = await svc.revoke(first.refreshToken)
    expect(result.revoked).toBe(true)
    expect(
      repo.rows.get(first.refreshTokenRow.adminRefreshTokenId)?.revokedAt,
    ).toBeInstanceOf(Date)
  })

  it('revoke() is idempotent — second call reports revoked=false', async () => {
    const seed = await bootstrapAdmin('p')
    const repo = fakeRefreshRepo()
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([seed]),
      tokens: repo,
      refreshPepper: PEPPER,
    })
    const first = await svc.login({ adminId: 'admin', password: 'p' })
    await svc.revoke(first.refreshToken)
    const again = await svc.revoke(first.refreshToken)
    expect(again.revoked).toBe(false)
  })
})

describe('admin auth — error type', () => {
  it('uses AdminAuthErrorResult so callers can switch on .kind', async () => {
    const svc = createAdminAuthService({
      accounts: fakeAccountRepo([]),
      tokens: fakeRefreshRepo(),
      refreshPepper: PEPPER,
    })
    try {
      await svc.login({ adminId: 'admin', password: 'whatever' })
      throw new Error('expected login to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(AdminAuthErrorResult)
    }
  })
})
