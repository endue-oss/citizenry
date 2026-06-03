import { eq, desc, sql } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { entries, type Schema } from '../db/schema'

export type EntryRepo = ReturnType<typeof createEntryRepo>

export type PageInput = { limit: number; offset: number }

export const createEntryRepo = (db: DrizzleD1Database<Schema>) => ({
  findById: (id: string) =>
    db.select().from(entries).where(eq(entries.id, id)).get(),

  listByOwner: (ownerId: string) =>
    db
      .select()
      .from(entries)
      .where(eq(entries.ownerId, ownerId))
      .orderBy(desc(entries.createdAt))
      .all(),

  listByOwnerPage: (ownerId: string, page: PageInput) =>
    db
      .select()
      .from(entries)
      .where(eq(entries.ownerId, ownerId))
      .orderBy(desc(entries.createdAt))
      .limit(page.limit)
      .offset(page.offset)
      .all(),

  countByOwner: async (ownerId: string): Promise<number> => {
    const row = await db
      .select({ n: sql<number>`count(*)` })
      .from(entries)
      .where(eq(entries.ownerId, ownerId))
      .get()
    return row?.n ?? 0
  },

  listAll: () => db.select().from(entries).orderBy(desc(entries.createdAt)).all(),

  listAllPage: (page: PageInput) =>
    db
      .select()
      .from(entries)
      .orderBy(desc(entries.createdAt))
      .limit(page.limit)
      .offset(page.offset)
      .all(),

  countAll: async (): Promise<number> => {
    const row = await db
      .select({ n: sql<number>`count(*)` })
      .from(entries)
      .get()
    return row?.n ?? 0
  },

  create: (input: typeof entries.$inferInsert) =>
    db.insert(entries).values(input).returning().get(),

  delete: (id: string) => db.delete(entries).where(eq(entries.id, id)),
})
