import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1'
import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { MiddlewareHandler } from 'hono'
import { schema as identitySchema, type Schema as IdentitySchema } from '@citizenry/identity/schema'
import { schema as vaultSchema, type Schema as VaultSchema } from '@citizenry/vault/schema'
import type { Bindings } from './env'

export type IdentityVars = { db: PostgresJsDatabase<IdentitySchema> }
export type VaultVars = { db: DrizzleD1Database<VaultSchema> }

export const identityDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: IdentityVars
}> = async (c, next) => {
  const client = postgres(c.env.HYPERDRIVE.connectionString, {
    prepare: false,
    max: 5,
    fetch_types: false,
  })
  c.set('db', drizzlePg(client, { schema: identitySchema }))
  await next()
}

export const vaultDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: VaultVars
}> = async (c, next) => {
  c.set('db', drizzleD1(c.env.DB_VAULT, { schema: vaultSchema }))
  await next()
}
