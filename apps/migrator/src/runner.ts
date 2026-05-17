// D1 마이그레이션 러너.
//
// 양쪽 도메인 (identity, vault) 모두 D1 이라 같은 코드가 처리한다.
//
// 동작:
//   1) `_migrations` 테이블 bootstrap (없으면 생성)
//   2) 적용된 파일 전부 읽어 Map(filename → {checksum, applied_at}) 구성
//   3) 입력 migrations 순회:
//        - filename 이 Map 에 있고 checksum 같음    → 'skipped'
//        - filename 이 Map 에 있고 checksum 다름    → 'failed' (drift) + 중단
//        - filename 이 Map 에 없음                  → exec(sql) + INSERT, 'applied'
//        - exec 또는 INSERT 가 실패하면              → 'failed' + 중단
//
// 동시 실행 가드:
//   D1 에 advisory lock 은 없다. 하지만 `_migrations.filename` 의 PRIMARY KEY
//   가 사실상 mutex 역할을 한다 — 두 러너가 동시에 같은 파일을 INSERT 하면
//   두 번째는 PK 충돌로 실패한다 (SQL 적용 자체는 idempotent 규약에 의존).
//
// idempotency 규약:
//   D1 multi-statement 가 트랜잭션 안에서 atomic 으로 안 묶이므로
//   모든 마이그레이션 파일은 `CREATE ... IF NOT EXISTS` 같은
//   idempotent 패턴을 유지해야 한다. 중간에 죽었다 재실행해도 안전.

import type { D1Database } from '@cloudflare/workers-types'
import type { MigrationResult, StatusEntry } from './env'
import type { Migration } from './migrations.generated'

async function bootstrap(db: D1Database) {
  // 단일 statement — exec() splitter 와 무관하게 안전.
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

// D1 exec() 의 statement splitter 가 (1) 라인 주석을 다음 statement 까지
// 끌고 가서 통째로 주석 처리하는 케이스, (2) 빈 줄을 statement 경계로
// 잘못 인식하는 케이스가 있어 사전 정규화한다.
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
