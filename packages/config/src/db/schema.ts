import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ── config ───────────────────────────────────────────────────
// Row identity is the ULID `config_id`. `config_key` is the
// natural lookup key (dot-separated namespace by convention,
// e.g. `mail.provider`). `config_value` is JSON-encoded;
// callers parse and stringify.
export const config = sqliteTable(
  'config',
  {
    configId: text('config_id').primaryKey(),
    configKey: text('config_key').notNull().unique('config_key_uniq'),
    configValue: text('config_value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedBy: text('updated_by'),
  },
  (t) => ({
    updatedAtIdx: index('config_updated_at_idx').on(t.updatedAt),
  }),
)

export const schema = { config }
export type Schema = typeof schema

export type ConfigRow = typeof config.$inferSelect
