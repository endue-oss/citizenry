import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { entries, type Schema } from '../db/schema'

export type EntryRepo = ReturnType<typeof createEntryRepo>

export const createEntryRepo = (db: DrizzleD1Database<Schema>) => ({
  findById: (id: string) =>
    db.select().from(entries).where(eq(entries.id, id)).get(),

  listByOwner: (ownerId: string) =>
    db.select().from(entries).where(eq(entries.ownerId, ownerId)).all(),

  listAll: () => db.select().from(entries).all(),

  create: (input: typeof entries.$inferInsert) =>
    db.insert(entries).values(input).returning().get(),

  delete: (id: string) => db.delete(entries).where(eq(entries.id, id)),
})
