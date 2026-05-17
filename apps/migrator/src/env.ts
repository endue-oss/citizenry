import type { D1Database } from '@cloudflare/workers-types'

export type Bindings = {
  /** D1 binding — identity domain (principal, tenant, agent, key, ...) */
  DB_IDENTITY: D1Database

  /** D1 binding — vault domain (encrypted entries) */
  DB_VAULT: D1Database

  /** Bearer token required on every authenticated request. */
  MIGRATOR_TOKEN: string
}

export type MigrationStatus = 'applied' | 'skipped' | 'failed'

export type MigrationResult = {
  filename: string
  checksum: string
  status: MigrationStatus
  /** ms taken to apply (skipped rows: 0). */
  duration_ms: number
  /** Only populated when status === 'failed'. */
  error?: string
}

export type StatusEntry = {
  filename: string
  checksum: string
  applied_at: string | null
  state: 'applied' | 'pending' | 'drifted'
  /** Populated when state === 'applied' or 'drifted' — the checksum currently in DB. */
  db_checksum?: string
}
