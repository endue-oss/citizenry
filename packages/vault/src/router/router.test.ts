import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { vaultRouter } from './index'
import { adminVaultRouter } from './admin'
import {
  createVaultService,
  VAULT_DATA_MAX_BYTES,
  type VaultService,
} from '../service/vault'
import type { EntryRepo, PageInput as RepoPageInput } from '../repo/entry'
import type { EntryRow, Schema } from '../db/schema'

// ── fake repo ─────────────────────────────────────────
// Mirrors packages/vault/src/service/vault.test.ts. Router tests only
// care about request parsing, status codes, and envelope shape — the
// service layer is already exercised by its own unit tests.
function fakeRepo(): EntryRepo & { rows: Map<string, EntryRow> } {
  const rows = new Map<string, EntryRow>()
  const sortedByOwner = (ownerId: string) =>
    [...rows.values()]
      .filter((r) => r.ownerId === ownerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const sortedAll = () =>
    [...rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return {
    rows,
    findById: async (id: string) => rows.get(id),
    listByOwner: async (ownerId: string) => sortedByOwner(ownerId),
    listByOwnerPage: async (ownerId: string, page: RepoPageInput) =>
      sortedByOwner(ownerId).slice(page.offset, page.offset + page.limit),
    countByOwner: async (ownerId: string) => sortedByOwner(ownerId).length,
    listAll: async () => sortedAll(),
    listAllPage: async (page: RepoPageInput) =>
      sortedAll().slice(page.offset, page.offset + page.limit),
    countAll: async () => rows.size,
    create: async (input: EntryRow) => {
      rows.set(input.id, input)
      return input
    },
    delete: async (id: string) => {
      rows.delete(id)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const noDb = null as unknown as DrizzleD1Database<Schema>

function buildSvc(repo: ReturnType<typeof fakeRepo>): VaultService {
  let n = 0
  return createVaultService({ db: noDb, repo, mintEntryId: () => `ven_test_${++n}` })
}

type AgentVars = {
  Variables: { vault: VaultService; agentJwtPayload?: { sub: string } }
}
type AdminVars = { Variables: { vault: VaultService } }

/**
 * Builds an isolated Hono app per test. The agent surface is mounted at
 * `/vault` to match apps/api/src/index.ts:52. `agentJwtPayload` and the
 * service are injected via middleware so we don't need a real D1.
 */
function agentApp(opts: { sub: string | null; service: VaultService }) {
  const app = new Hono<AgentVars>()
  app.use('*', async (c, next) => {
    c.set('vault', opts.service)
    if (opts.sub) c.set('agentJwtPayload', { sub: opts.sub })
    await next()
  })
  app.route('/vault', vaultRouter)
  return app
}

function adminApp(service: VaultService) {
  const app = new Hono<AdminVars>()
  app.use('*', async (c, next) => {
    c.set('vault', service)
    await next()
  })
  app.route('/', adminVaultRouter)
  return app
}

const jweFixture = 'eyJhbGciOiJFQ0RILUVTK0EyNTZLVyJ9.fake.jwe.blob'

describe('vault router — agent surface', () => {
  describe('POST /vault/entries', () => {
    it('201 on valid body, echoes JWE verbatim', async () => {
      const repo = fakeRepo()
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(repo) }).request(
        '/vault/entries',
        {
          method: 'POST',
          body: JSON.stringify({ data: jweFixture }),
          headers: { 'content-type': 'application/json' },
        },
      )
      expect(res.status).toBe(201)
      const body = (await res.json()) as { id: string; data: string; owner_id: string }
      expect(body.data).toBe(jweFixture)
      expect(body.owner_id).toBe('ag_a')
      expect(body.id).toMatch(/^ven_/)
      expect(repo.rows.size).toBe(1)
    })

    it('401 ERR-P01-S03-0401 when no agent JWT', async () => {
      const res = await agentApp({ sub: null, service: buildSvc(fakeRepo()) }).request(
        '/vault/entries',
        {
          method: 'POST',
          body: JSON.stringify({ data: jweFixture }),
          headers: { 'content-type': 'application/json' },
        },
      )
      expect(res.status).toBe(401)
      const body = (await res.json()) as { code: string; title: string }
      expect(body.code).toBe('ERR-P01-S03-0401')
      expect(body.title).toBe('Unauthorized')
    })

    it('400 ERR-P01-S03-0400 on non-JSON body', async () => {
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries',
        { method: 'POST', body: 'not json', headers: { 'content-type': 'application/json' } },
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { code: string }
      expect(body.code).toBe('ERR-P01-S03-0400')
    })

    it('400 ERR-P01-S03-2001 when data is missing or empty', async () => {
      const app = agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) })
      const empty = await app.request('/vault/entries', {
        method: 'POST',
        body: JSON.stringify({ data: '' }),
        headers: { 'content-type': 'application/json' },
      })
      expect(empty.status).toBe(400)
      expect(((await empty.json()) as { code: string }).code).toBe('ERR-P01-S03-2001')

      const missing = await app.request('/vault/entries', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      })
      expect(missing.status).toBe(400)
      expect(((await missing.json()) as { code: string }).code).toBe('ERR-P01-S03-2001')
    })

    it('413 ERR-P01-S03-0413 when data exceeds the byte cap', async () => {
      const oversize = 'x'.repeat(VAULT_DATA_MAX_BYTES + 1)
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries',
        {
          method: 'POST',
          body: JSON.stringify({ data: oversize }),
          headers: { 'content-type': 'application/json' },
        },
      )
      expect(res.status).toBe(413)
      const body = (await res.json()) as { code: string; title: string }
      expect(body.code).toBe('ERR-P01-S03-0413')
      expect(body.title).toBe('Payload Too Large')
    })

    it('201 right at the byte cap (boundary)', async () => {
      const atCap = 'x'.repeat(VAULT_DATA_MAX_BYTES)
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries',
        {
          method: 'POST',
          body: JSON.stringify({ data: atCap }),
          headers: { 'content-type': 'application/json' },
        },
      )
      expect(res.status).toBe(201)
    })
  })

  describe('GET /vault/entries', () => {
    it('returns paginated meta with newest-first items', async () => {
      const repo = fakeRepo()
      const s = buildSvc(repo)
      for (let i = 0; i < 3; i++) {
        await s.create({ ownerId: 'ag_a', data: `d${i}` })
        await new Promise((r) => setTimeout(r, 1))
      }
      await s.create({ ownerId: 'ag_b', data: 'other' })

      const res = await agentApp({ sub: 'ag_a', service: s }).request(
        '/vault/entries?page=1&limit=2',
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        items: Array<{ owner_id: string }>
        meta: { total: number; page: number; limit: number; has_next_page: boolean }
      }
      expect(body.items.every((e) => e.owner_id === 'ag_a')).toBe(true)
      expect(body.items.length).toBe(2)
      expect(body.meta).toMatchObject({ total: 3, page: 1, limit: 2, has_next_page: true })
    })

    it('clamps limit to the max and falls back to defaults on bad values', async () => {
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries?page=abc&limit=99999',
      )
      const body = (await res.json()) as { meta: { page: number; limit: number } }
      expect(body.meta.page).toBe(1)
      expect(body.meta.limit).toBe(100)
    })

    it('401 when no agent JWT', async () => {
      const res = await agentApp({ sub: null, service: buildSvc(fakeRepo()) }).request(
        '/vault/entries',
      )
      expect(res.status).toBe(401)
    })
  })

  describe('GET /vault/entries/:id', () => {
    it('200 for an owned entry', async () => {
      const repo = fakeRepo()
      const s = buildSvc(repo)
      const created = await s.create({ ownerId: 'ag_a', data: jweFixture })
      const res = await agentApp({ sub: 'ag_a', service: s }).request(
        `/vault/entries/${created.id}`,
      )
      expect(res.status).toBe(200)
      const body = (await res.json()) as { id: string }
      expect(body.id).toBe(created.id)
    })

    it('404 ERR-P01-S03-0404 for cross-owner reads (no existence oracle)', async () => {
      const repo = fakeRepo()
      const s = buildSvc(repo)
      const created = await s.create({ ownerId: 'ag_a', data: jweFixture })
      const res = await agentApp({ sub: 'ag_b', service: s }).request(
        `/vault/entries/${created.id}`,
      )
      expect(res.status).toBe(404)
      expect(((await res.json()) as { code: string }).code).toBe('ERR-P01-S03-0404')
    })

    it('404 for unknown id', async () => {
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries/ven_missing',
      )
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /vault/entries/:id', () => {
    it('204 when owner deletes their own entry', async () => {
      const repo = fakeRepo()
      const s = buildSvc(repo)
      const created = await s.create({ ownerId: 'ag_a', data: jweFixture })
      const res = await agentApp({ sub: 'ag_a', service: s }).request(
        `/vault/entries/${created.id}`,
        { method: 'DELETE' },
      )
      expect(res.status).toBe(204)
      expect(repo.rows.size).toBe(0)
    })

    it('404 (not 403) when a non-owner attempts delete; row is untouched', async () => {
      const repo = fakeRepo()
      const s = buildSvc(repo)
      const created = await s.create({ ownerId: 'ag_a', data: jweFixture })
      const res = await agentApp({ sub: 'ag_b', service: s }).request(
        `/vault/entries/${created.id}`,
        { method: 'DELETE' },
      )
      expect(res.status).toBe(404)
      expect(((await res.json()) as { code: string }).code).toBe('ERR-P01-S03-0404')
      expect(repo.rows.size).toBe(1)
    })

    it('404 for unknown id', async () => {
      const res = await agentApp({ sub: 'ag_a', service: buildSvc(fakeRepo()) }).request(
        '/vault/entries/ven_missing',
        { method: 'DELETE' },
      )
      expect(res.status).toBe(404)
    })

    it('401 when no agent JWT', async () => {
      const res = await agentApp({ sub: null, service: buildSvc(fakeRepo()) }).request(
        '/vault/entries/ven_anything',
        { method: 'DELETE' },
      )
      expect(res.status).toBe(401)
    })
  })
})

describe('vault router — admin surface', () => {
  it('GET lists across owners and supports owner_id filter + pagination meta', async () => {
    const repo = fakeRepo()
    const s = buildSvc(repo)
    await s.create({ ownerId: 'ag_a', data: 'a' })
    await s.create({ ownerId: 'ag_b', data: 'b' })

    const all = await adminApp(s).request('/v1/admin/vault/entries?page=1&limit=25')
    expect(all.status).toBe(200)
    const allBody = (await all.json()) as { items: unknown[]; meta: { total: number } }
    expect(allBody.meta.total).toBe(2)
    expect(allBody.items.length).toBe(2)

    const onlyA = await adminApp(s).request('/v1/admin/vault/entries?owner_id=ag_a')
    const onlyABody = (await onlyA.json()) as {
      items: Array<{ owner_id: string }>
      meta: { total: number }
    }
    expect(onlyABody.meta.total).toBe(1)
    expect(onlyABody.items[0]?.owner_id).toBe('ag_a')
  })

  it('DELETE is idempotent (always 204)', async () => {
    const repo = fakeRepo()
    const s = buildSvc(repo)
    const created = await s.create({ ownerId: 'ag_a', data: 'a' })

    const once = await adminApp(s).request(`/v1/admin/vault/entries/${created.id}`, {
      method: 'DELETE',
    })
    expect(once.status).toBe(204)

    const twice = await adminApp(s).request(`/v1/admin/vault/entries/${created.id}`, {
      method: 'DELETE',
    })
    expect(twice.status).toBe(204)
    expect(repo.rows.size).toBe(0)
  })
})
