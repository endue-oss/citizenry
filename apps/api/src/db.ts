import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import { schema as identitySchema, type Schema as IdentitySchema } from '@citizenry/identity/schema'
import { schema as vaultSchema, type Schema as VaultSchema } from '@citizenry/vault/schema'
import {
  schema as configSchema,
  type Schema as ConfigSchema,
  createConfigReader,
  withTtlCache,
  type CachedConfigReader,
} from '@citizenry/config'
import type { Bindings } from './env'

export type IdentityVars = { db: DrizzleD1Database<IdentitySchema> }
export type VaultVars = { db: DrizzleD1Database<VaultSchema> }
export type ConfigVars = { db: DrizzleD1Database<ConfigSchema> }
export type ConfigReaderVars = { config: CachedConfigReader }

export const identityDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: IdentityVars
}> = async (c, next) => {
  c.set('db', drizzleD1(c.env.DB_IDENTITY, { schema: identitySchema }))
  await next()
}

export const vaultDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: VaultVars
}> = async (c, next) => {
  c.set('db', drizzleD1(c.env.DB_VAULT, { schema: vaultSchema }))
  await next()
}

export const configDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: ConfigVars
}> = async (c, next) => {
  c.set('db', drizzleD1(c.env.DB_CONFIG, { schema: configSchema }))
  await next()
}

// Colo-local cached config reader for the data plane.
//
// The cache is a module-scope singleton, kept alive for the lifetime
// of the V8 isolate. Identity / vault routers reach this via
// `c.var.config`. Admin write paths must continue to use `configDb`
// (raw drizzle) so writes are not served stale from cache.
let cachedReader: CachedConfigReader | null = null
let cachedBinding: D1Database | null = null

export const configReader: MiddlewareHandler<{
  Bindings: Bindings
  Variables: ConfigReaderVars
}> = async (c, next) => {
  if (!cachedReader) {
    cachedBinding = c.env.DB_CONFIG
    cachedReader = withTtlCache(
      createConfigReader(drizzleD1(c.env.DB_CONFIG, { schema: configSchema })),
    )
  } else if (cachedBinding !== c.env.DB_CONFIG) {
    throw new Error(
      'config reader bound to a different DB_CONFIG instance than first seen — isolate is multiplexing bindings',
    )
  }
  c.set('config', cachedReader)
  await next()
}
