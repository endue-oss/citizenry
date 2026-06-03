import { describe, expect, it } from 'vitest'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { createVaultService, VaultError } from './vault'
import type { EntryRepo, PageInput as RepoPageInput } from '../repo/entry'
import type { EntryRow, Schema } from '../db/schema'

// ── fake repo ─────────────────────────────────────────
// In-memory entry store mirroring the drizzle repo surface. The service
// only ever touches the repo, so this exercises owner-scoping and shape
// mapping without a real D1.
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

function svc(repo: ReturnType<typeof fakeRepo>, seq = 0) {
  let n = seq
  return createVaultService({ db: noDb, repo, mintEntryId: () => `ven_test_${++n}` })
}

describe('vault service', () => {
  it('creates an entry under the caller and echoes the JWE verbatim', async () => {
    const repo = fakeRepo()
    const jwe = 'eyJhbGciOiJFQ0RILUVTK0EyNTZLVyJ9.fake.jwe.blob'
    const entry = await svc(repo).create({ ownerId: 'ag_a', data: jwe })

    expect(entry.owner_id).toBe('ag_a')
    expect(entry.data).toBe(jwe)
    expect(entry.id).toMatch(/^ven_/)
    expect(repo.rows.size).toBe(1)
  })

  it('reads back an entry owned by the caller', async () => {
    const repo = fakeRepo()
    const created = await svc(repo).create({ ownerId: 'ag_a', data: 'jwe-1' })
    const read = await svc(repo).get('ag_a', created.id)
    expect(read.data).toBe('jwe-1')
  })

  it('hides another agent’s entry behind not_found (no cross-owner read)', async () => {
    const repo = fakeRepo()
    const created = await svc(repo).create({ ownerId: 'ag_a', data: 'secret' })
    await expect(svc(repo).get('ag_b', created.id)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(svc(repo).get('ag_b', created.id)).rejects.toBeInstanceOf(VaultError)
  })

  it('not_found for a missing id', async () => {
    const repo = fakeRepo()
    await expect(svc(repo).get('ag_a', 'ven_missing')).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('lists only the caller’s entries (excludes other owners)', async () => {
    const repo = fakeRepo()
    const s = svc(repo)
    await s.create({ ownerId: 'ag_a', data: 'a1' })
    await s.create({ ownerId: 'ag_b', data: 'b1' })
    await s.create({ ownerId: 'ag_a', data: 'a2' })

    const mine = await s.list('ag_a', { page: 1, limit: 25 })
    expect(mine.total).toBe(2)
    expect(mine.items.every((e) => e.owner_id === 'ag_a')).toBe(true)
    expect(mine.items.map((e) => e.data).sort()).toEqual(['a1', 'a2'])
  })

  it('paginates list results with stable newest-first order', async () => {
    const repo = fakeRepo()
    const s = svc(repo)
    // createdAt ticks per insert because we use a fresh `new Date()` —
    // give the fake a small spread by inserting sequentially.
    for (let i = 0; i < 5; i++) {
      await s.create({ ownerId: 'ag_a', data: `d${i}` })
      await new Promise((r) => setTimeout(r, 1))
    }
    const p1 = await s.list('ag_a', { page: 1, limit: 2 })
    const p2 = await s.list('ag_a', { page: 2, limit: 2 })
    const p3 = await s.list('ag_a', { page: 3, limit: 2 })
    expect(p1.total).toBe(5)
    expect(p1.items).toHaveLength(2)
    expect(p2.items).toHaveLength(2)
    expect(p3.items).toHaveLength(1)
    // No overlap across pages, all owned by ag_a.
    const ids = [...p1.items, ...p2.items, ...p3.items].map((e) => e.id)
    expect(new Set(ids).size).toBe(5)
  })

  it('owner-scoped delete: 204 path removes the row, cross-owner is not_found', async () => {
    const repo = fakeRepo()
    const s = svc(repo)
    const a = await s.create({ ownerId: 'ag_a', data: 'a' })
    await expect(s.delete('ag_b', a.id)).rejects.toMatchObject({ code: 'not_found' })
    expect(repo.rows.size).toBe(1) // not deleted by foreign caller
    await s.delete('ag_a', a.id)
    expect(repo.rows.size).toBe(0)
    // Second owner-scoped delete is not_found (idempotency is the
    // router's contract via 404; service stays strict).
    await expect(s.delete('ag_a', a.id)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('admin lists across owners and deletes idempotently', async () => {
    const repo = fakeRepo()
    const s = svc(repo)
    const a = await s.create({ ownerId: 'ag_a', data: 'a' })
    await s.create({ ownerId: 'ag_b', data: 'b' })

    const all = await s.adminList({ page: 1, limit: 25 })
    expect(all.total).toBe(2)
    expect(all.items.length).toBe(2)

    const onlyB = await s.adminList({ page: 1, limit: 25 }, 'ag_b')
    expect(onlyB.items.map((e) => e.data)).toEqual(['b'])

    await s.adminDelete(a.id)
    await s.adminDelete(a.id) // idempotent
    const after = await s.adminList({ page: 1, limit: 25 })
    expect(after.total).toBe(1)
  })
})
