import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema, type Schema } from './schema'

export type Db = PostgresJsDatabase<Schema>

/**
 * postgres-js + drizzle 인스턴스 생성.
 *
 * Cloudflare Workers + Hyperdrive 컨텍스트에서 호출:
 *   `createDb(env.HYPERDRIVE.connectionString)`
 *
 * Hyperdrive 가 connection pooling + TLS 종단을 담당하므로
 * postgres-js 옵션은 단순 — `prepare: false` 만 권장 (Hyperdrive 와 호환).
 */
export const createDb = (connectionString: string): Db => {
  const client = postgres(connectionString, {
    prepare: false,
    max: 5,
  })
  return drizzle(client, { schema })
}

export { schema, type Schema }
export * from './schema'
