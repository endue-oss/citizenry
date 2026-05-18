import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { D1Database } from '@cloudflare/workers-types'
import type { MiddlewareHandler } from 'hono'
import {
  schema as identitySchema,
  type Schema as IdentitySchema,
} from '@citizenry/identity/schema'
import {
  schema as configSchema,
  type Schema as ConfigSchema,
  createConfigReader,
  withTtlCache,
  type CachedConfigReader,
} from '@citizenry/config'
import type { Bindings } from './env'

export type IdentityVars = { db: DrizzleD1Database<IdentitySchema> }
export type ConfigReaderVars = { config: CachedConfigReader }

export const identityDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: IdentityVars
}> = async (c, next) => {
  c.set('db', drizzle(c.env.DB_IDENTITY, { schema: identitySchema }))
  await next()
}

// Colo-local cached config reader. The cache is a module-scope
// singleton tied to the V8 isolate's lifetime — so password reads on
// hot paths skip D1 for up to 5 minutes after the first hit. Operators
// who rotate the password through the config admin API (or by direct
// `wrangler d1 execute`) see propagation bounded by the TTL.
let cachedReader: CachedConfigReader | null = null
let cachedBinding: D1Database | null = null

export const configReader: MiddlewareHandler<{
  Bindings: Bindings
  Variables: ConfigReaderVars
}> = async (c, next) => {
  if (!cachedReader) {
    cachedBinding = c.env.DB_CONFIG
    cachedReader = withTtlCache(
      createConfigReader(drizzle(c.env.DB_CONFIG, { schema: configSchema })),
    )
  } else if (cachedBinding !== c.env.DB_CONFIG) {
    throw new Error(
      'config reader bound to a different DB_CONFIG instance than first seen — isolate is multiplexing bindings',
    )
  }
  c.set('config', cachedReader)
  await next()
}
