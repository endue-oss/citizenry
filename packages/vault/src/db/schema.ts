import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ── entries ──────────────────────────────────────────────────
// End-to-end encrypted secret entries. `data` is an RFC 7516 JWE
// (compact or JSON serialization) produced client-side and encrypted to
// the owning agent's X25519 encryption key. The server stores it
// verbatim and never holds the data key — it cannot decrypt.
export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    data: text('data').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    ownerIdx: index('idx_entries_owner_id').on(t.ownerId),
  }),
)

export const schema = { entries }
export type Schema = typeof schema
export type EntryRow = typeof entries.$inferSelect
