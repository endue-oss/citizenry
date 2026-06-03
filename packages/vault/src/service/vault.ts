import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema, EntryRow } from '../db/schema'
import { createEntryRepo, type EntryRepo } from '../repo/entry'
import { newEntryId } from '../ids'

export type VaultErrorCode = 'invalid_body' | 'not_found' | 'forbidden' | 'payload_too_large'

export class VaultError extends Error {
  constructor(
    readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'VaultError'
  }
}

/** Maximum byte length of the `data` JWE blob — mirrors the spec cap. */
export const VAULT_DATA_MAX_BYTES = 65536
export const VAULT_PAGE_LIMIT_DEFAULT = 25
export const VAULT_PAGE_LIMIT_MAX = 100

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

export type PageInput = { page: number; limit: number }

export type PagedResult<T> = {
  items: T[]
  total: number
  page: number
  limit: number
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
    /** Entries owned by the caller, newest first. Paginated. */
    list: async (ownerId: string, page: PageInput): Promise<PagedResult<EntryView>> => {
      const offset = (page.page - 1) * page.limit
      const [rows, total] = await Promise.all([
        entries.listByOwnerPage(ownerId, { limit: page.limit, offset }),
        entries.countByOwner(ownerId),
      ])
      return { items: rows.map(entryView), total, page: page.page, limit: page.limit }
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

    /**
     * Owner-scoped delete. Throws `not_found` when missing or owned by
     * someone else — same 404-only contract as `get` (no existence
     * oracle to a non-owner).
     */
    delete: async (ownerId: string, id: string): Promise<void> => {
      const row = await entries.findById(id)
      if (!row || row.ownerId !== ownerId) {
        throw new VaultError('not_found', 'entry not found')
      }
      await entries.delete(id)
    },

    // ── admin (X-Service-Key) ──────────────────────────────────
    adminList: async (
      page: PageInput,
      ownerId?: string,
    ): Promise<PagedResult<EntryView>> => {
      const offset = (page.page - 1) * page.limit
      const [rows, total] = await Promise.all([
        ownerId
          ? entries.listByOwnerPage(ownerId, { limit: page.limit, offset })
          : entries.listAllPage({ limit: page.limit, offset }),
        ownerId ? entries.countByOwner(ownerId) : entries.countAll(),
      ])
      return { items: rows.map(entryView), total, page: page.page, limit: page.limit }
    },

    /** Idempotent operator delete. */
    adminDelete: async (id: string): Promise<void> => {
      await entries.delete(id)
    },
  }
}

export type VaultService = ReturnType<typeof createVaultService>
