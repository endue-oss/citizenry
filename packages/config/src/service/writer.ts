// Write/delete config service.
//
// Mounted under api `/_admin/api/v1/admin/config/*` and reached only
// through admin-api's X-Service-Key proxy. The data-plane packages
// (identity, mail) do not import this — they hold a `ConfigReader`
// only.

import type { Db } from '../db'
import { createConfigRepo } from '../repo/config'
import type { ConfigEntry } from './reader'

export type ConfigWriter = {
  set<T>(input: {
    key: string
    value: T
    updatedBy: string | null
  }): Promise<ConfigEntry<T>>
  delete(key: string): Promise<ConfigEntry | null>
}

export const createConfigWriter = (db: Db): ConfigWriter => {
  const repo = createConfigRepo(db)

  return {
    async set<T>(input: {
      key: string
      value: T
      updatedBy: string | null
    }): Promise<ConfigEntry<T>> {
      const row = await repo.upsert({
        key: input.key,
        value: JSON.stringify(input.value),
        updatedBy: input.updatedBy,
      })
      if (!row) {
        throw new Error(`config upsert returned no row for key=${input.key}`)
      }
      return {
        id: row.configId,
        key: row.configKey,
        value: JSON.parse(row.configValue) as T,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }
    },

    async delete(key: string): Promise<ConfigEntry | null> {
      const row = await repo.remove(key)
      if (!row) return null
      return {
        id: row.configId,
        key: row.configKey,
        value: JSON.parse(row.configValue),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      }
    },
  }
}
