import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { schema, type Schema } from './schema'

export type Db = DrizzleD1Database<Schema>

export { schema, type Schema }
export * from './schema'
