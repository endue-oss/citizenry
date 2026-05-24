import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema, EntryRow } from '../db/schema'
import { createEntryRepo, type EntryRepo } from '../repo/entry'
import { newEntryId } from '../ids'

export type VaultErrorCode = 'invalid_body' | 'not_found' | 'forbidden'

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'VaultError'
  }
}

/** API-shaped entry. `data` is the stored RFC 7516 JWE, verbatim. */
export type EntryView = {
  id: string
  owner_id: string
  data: string
  created_at: string
}

export type CreateInput = {
  ownerId: string
  data: string
}

const entryView = (e: EntryRow): EntryView => ({
  id: e.id,
  owner_id: e.ownerId,
  data: e.data,
  created_at: e.createdAt.toISOString(),
})

export const createVaultService = (deps: {
  db: DrizzleD1Database<Schema>
  /** Inject for tests; defaults to a drizzle-backed repo over `db`. */
  repo?: EntryRepo
  mintEntryId?: () => string
}) => {
  const entries = deps.repo ?? createEntryRepo(deps.db)
  const mintId = deps.mintEntryId ?? newEntryId

  return {
    /** Entries owned by the caller, newest first. */
    list: async (ownerId: string): Promise<EntryView[]> => {
      const rows = await entries.listByOwner(ownerId)
      return rows.map(entryView)
    },

    /**
     * Read one entry. Throws `not_found` when missing or owned by
     * someone else (non-owner reads are indistinguishable from missing
     * — see spec: 404 on non-owner).
     */
    get: async (ownerId: string, id: string): Promise<EntryView> => {
      const row = await entries.findById(id)
      if (!row || row.ownerId !== ownerId) {
        throw new VaultError('not_found', 'entry not found')
      }
      return entryView(row)
    },

    /** Create an entry under the caller. */
    create: async (input: CreateInput): Promise<EntryView> => {
      const id = mintId()
      const createdAt = new Date()
      const row = await entries.create({
        id,
        ownerId: input.ownerId,
        data: input.data,
        createdAt,
      })
      return entryView(
        row ?? { id, ownerId: input.ownerId, data: input.data, createdAt },
      )
    },

    // ── admin (X-Service-Key) ──────────────────────────────────
    adminList: async (ownerId?: string): Promise<EntryView[]> => {
      const rows = ownerId
        ? await entries.listByOwner(ownerId)
        : await entries.listAll()
      return rows.map(entryView)
    },

    /** Idempotent operator delete. */
    adminDelete: async (id: string): Promise<void> => {
      await entries.delete(id)
    },
  }
}

export type VaultService = ReturnType<typeof createVaultService>
