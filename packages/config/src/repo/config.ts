import { asc, eq, like } from 'drizzle-orm'
import type { Db } from '../db'
import { config, type ConfigRow } from '../db/schema'
import { newConfigId } from '../ids'

export type ConfigRepo = ReturnType<typeof createConfigRepo>

export const createConfigRepo = (db: Db) => ({
  findByKey: (key: string): Promise<ConfigRow | undefined> =>
    db
      .select()
      .from(config)
      .where(eq(config.configKey, key))
      .limit(1)
      .then((rows) => rows[0]),

  findById: (id: string): Promise<ConfigRow | undefined> =>
    db
      .select()
      .from(config)
      .where(eq(config.configId, id))
      .limit(1)
      .then((rows) => rows[0]),

  list: (prefix?: string): Promise<ConfigRow[]> => {
    const base = db.select().from(config)
    const filtered = prefix
      ? base.where(like(config.configKey, `${prefix}%`))
      : base
    return filtered.orderBy(asc(config.configKey)).all()
  },

  /**
   * Insert when absent, update value/audit fields when the same
   * `config_key` already exists. The row's `config_id` is preserved
   * on update — admin tooling can rely on it as a stable handle.
   */
  upsert: (input: {
    key: string
    value: string
    updatedBy: string | null
  }): Promise<ConfigRow | undefined> =>
    db
      .insert(config)
      .values({
        configId: newConfigId(),
        configKey: input.key,
        configValue: input.value,
        updatedAt: new Date(),
        updatedBy: input.updatedBy,
      })
      .onConflictDoUpdate({
        target: config.configKey,
        set: {
          configValue: input.value,
          updatedAt: new Date(),
          updatedBy: input.updatedBy,
        },
      })
      .returning()
      .then((rows) => rows[0]),

  remove: (key: string): Promise<ConfigRow | undefined> =>
    db
      .delete(config)
      .where(eq(config.configKey, key))
      .returning()
      .then((rows) => rows[0]),
})
