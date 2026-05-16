import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  data: text('data').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const schema = { entries }
export type Schema = typeof schema
