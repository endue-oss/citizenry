import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// ── config ───────────────────────────────────────────────────
// Single key/value table. `config_value` stores JSON; callers parse
// and stringify. Singular table name, snake_case, matches the rest of
// the citizenry schema.
export const config = sqliteTable(
  'config',
  {
    configKey: text('config_key').primaryKey(),
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
