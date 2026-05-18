import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import { schema as mailSchema, type Schema as MailSchema } from '@citizenry/mail/schema'
import {
  schema as configSchema,
  createConfigReader,
  withTtlCache,
  type CachedConfigReader,
} from '@citizenry/config'
import type { Bindings } from './env'

export type MailVars = { db: DrizzleD1Database<MailSchema> }
export type ConfigVars = { config: CachedConfigReader }

export const mailDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: MailVars
}> = async (c, next) => {
  c.set('db', drizzle(c.env.DB_MAIL, { schema: mailSchema }))
  await next()
}

// Colo-local cached config reader.
//
// The cache lives at module scope so it survives across requests
// processed by the same V8 isolate. The cache is bound to the first
// `DB_CONFIG` binding seen — in practice every request in an isolate
// shares the same binding, so a single instance is correct. If the
// runtime ever hands us a different binding we throw rather than
// silently mixing two D1s.
let cachedReader: CachedConfigReader | null = null
let cachedBinding: D1Database | null = null

export const configReader: MiddlewareHandler<{
  Bindings: Bindings
  Variables: ConfigVars
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
