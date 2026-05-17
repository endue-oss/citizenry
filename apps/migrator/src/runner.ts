// D1 migration runner.
//
// Both domains (identity, vault) are D1, so the same code handles both.
//
// Behavior:
//   1) bootstrap the `_migrations` table (create if absent)
//   2) read all applied rows into Map(filename → {checksum, applied_at})
//   3) iterate input migrations:
//        - filename in Map and checksum matches    → 'skipped'
//        - filename in Map and checksum differs    → 'failed' (drift) + abort
//        - filename not in Map                     → exec(sql) + INSERT, 'applied'
//        - exec or INSERT fails                    → 'failed' + abort
//
// Concurrent-execution guard:
//   D1 has no advisory lock. But `_migrations.filename`'s PRIMARY KEY
//   effectively acts as a mutex — if two runners INSERT the same file
//   concurrently, the second fails on PK conflict (the SQL apply itself
//   relies on the idempotency convention below).
//
// Idempotency convention:
//   D1 multi-statement exec is not bound atomically inside a transaction,
//   so every migration file must stick to idempotent patterns such as
//   `CREATE ... IF NOT EXISTS`. Safe to re-run after a mid-flight crash.

import type { D1Database } from '@cloudflare/workers-types'
import type { MigrationResult, StatusEntry } from './env'
import type { Migration } from './migrations.generated'

async function bootstrap(db: D1Database) {
  // Single statement — safe regardless of the exec() splitter.
  await db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`,
  )
}

async function readApplied(
  db: D1Database,
): Promise<Map<string, { checksum: string; applied_at: number }>> {
  const { results } = await db
    .prepare('SELECT filename, checksum, applied_at FROM _migrations')
    .all<{ filename: string; checksum: string; applied_at: number }>()
  return new Map(
    results.map((r) => [r.filename, { checksum: r.checksum, applied_at: r.applied_at }]),
  )
}

export async function applyD1(
  db: D1Database,
  migrations: readonly Migration[],
): Promise<MigrationResult[]> {
  await bootstrap(db)
  const applied = await readApplied(db)
  const results: MigrationResult[] = []

  for (const m of migrations) {
    const started = Date.now()
    const existing = applied.get(m.filename)

    if (existing) {
      if (existing.checksum !== m.checksum) {
        results.push({
          filename: m.filename,
          checksum: m.checksum,
          status: 'failed',
          duration_ms: 0,
          error: `checksum drift for ${m.filename}: db=${existing.checksum} file=${m.checksum}`,
        })
        break
      }
      results.push({
        filename: m.filename,
        checksum: m.checksum,
        status: 'skipped',
        duration_ms: 0,
      })
      continue
    }

    try {
      await db.exec(prepareForD1Exec(m.sql))
      await db
        .prepare(
          'INSERT INTO _migrations (filename, checksum, applied_at) VALUES (?, ?, ?)',
        )
        .bind(m.filename, m.checksum, Date.now())
        .run()
      results.push({
        filename: m.filename,
        checksum: m.checksum,
        status: 'applied',
        duration_ms: Date.now() - started,
      })
    } catch (err) {
      results.push({
        filename: m.filename,
        checksum: m.checksum,
        status: 'failed',
        duration_ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      })
      break
    }
  }

  return results
}

export async function statusD1(
  db: D1Database,
  migrations: readonly Migration[],
): Promise<StatusEntry[]> {
  await bootstrap(db)
  const applied = await readApplied(db)
  return migrations.map<StatusEntry>((m) => {
    const row = applied.get(m.filename)
    if (!row) {
      return {
        filename: m.filename,
        checksum: m.checksum,
        applied_at: null,
        state: 'pending',
      }
    }
    const state = row.checksum === m.checksum ? 'applied' : 'drifted'
    return {
      filename: m.filename,
      checksum: m.checksum,
      applied_at: new Date(row.applied_at).toISOString(),
      state,
      db_checksum: row.checksum,
    }
  })
}

// D1 exec()'s statement splitter (1) sometimes drags a line comment into
// the next statement, commenting out the whole thing, and (2) sometimes
// misreads blank lines as statement boundaries. Normalize up-front.
function prepareForD1Exec(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
    .replace(/\n{2,}/g, '\n')
}
