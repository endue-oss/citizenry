// Read-only config service.
//
// Consumed by data-plane packages (identity, mail, ...) to look up
// runtime config values. Wrap with `withTtlCache` from `./cache` to
// avoid hitting D1 on every request; see packages/config/README.
//
// `null` is a meaningful return — it means the key has never been
// written. Callers decide their own default fallback.

import type { Db } from '../db'
import { createConfigRepo } from '../repo/config'

export type ConfigEntry<T = unknown> = {
  key: string
  value: T
  updatedAt: Date
  updatedBy: string | null
}

export type ConfigReader = {
  /** Single-key lookup. Returns null if the key has never been written. */
  get<T = unknown>(key: string): Promise<ConfigEntry<T> | null>
  /** List entries, optionally filtered to a prefix (e.g. `mail.`). */
  list<T = unknown>(prefix?: string): Promise<ConfigEntry<T>[]>
}

export const createConfigReader = (db: Db): ConfigReader => {
  const repo = createConfigRepo(db)

  return {
    async get<T = unknown>(key: string): Promise<ConfigEntry<T> | null> {
      const row = await repo.findByKey(key)
      if (!row) return null
      return {
        key: row.configKey,
        value: JSON.parse(row.configValue) as T,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }
    },

    async list<T = unknown>(prefix?: string): Promise<ConfigEntry<T>[]> {
      const rows = await repo.list(prefix)
      return rows.map((r) => ({
        key: r.configKey,
        value: JSON.parse(r.configValue) as T,
        updatedAt: r.updatedAt,
        updatedBy: r.updatedBy,
      }))
    },
  }
}
