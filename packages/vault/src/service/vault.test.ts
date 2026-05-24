import { describe, expect, it } from 'vitest'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { createVaultService, VaultError } from './vault'
import type { EntryRepo } from '../repo/entry'
import type { EntryRow, Schema } from '../db/schema'

// ── fake repo ─────────────────────────────────────────
// In-memory entry store mirroring the drizzle repo surface. The service
// only ever touches the repo, so this exercises owner-scoping and shape
// mapping without a real D1.
function fakeRepo(): EntryRepo & { rows: Map<string, EntryRow> } {
  const rows = new Map<string, EntryRow>()
  return {
    rows,
    findById: async (id: string) => rows.get(id),
    listByOwner: async (ownerId: string) =>
      [...rows.values()]
        .filter((r) => r.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    listAll: async () =>
      [...rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
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

    const mine = await s.list('ag_a')
    expect(mine.every((e) => e.owner_id === 'ag_a')).toBe(true)
    expect(mine.map((e) => e.data).sort()).toEqual(['a1', 'a2'])
  })

  it('admin lists across owners and deletes idempotently', async () => {
    const repo = fakeRepo()
    const s = svc(repo)
    const a = await s.create({ ownerId: 'ag_a', data: 'a' })
    await s.create({ ownerId: 'ag_b', data: 'b' })

    expect((await s.adminList()).length).toBe(2)
    expect((await s.adminList('ag_b')).map((e) => e.data)).toEqual(['b'])

    await s.adminDelete(a.id)
    await s.adminDelete(a.id) // idempotent
    expect((await s.adminList()).length).toBe(1)
  })
})
