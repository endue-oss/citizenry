import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import {
  schema as identitySchema,
  type Schema as IdentitySchema,
} from '@citizenry/identity/schema'
import type { Bindings } from './env'

export type IdentityVars = { db: DrizzleD1Database<IdentitySchema> }

export const identityDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: IdentityVars
}> = async (c, next) => {
  c.set('db', drizzle(c.env.DB_IDENTITY, { schema: identitySchema }))
  await next()
}
