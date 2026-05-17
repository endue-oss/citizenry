import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import { schema as emailSchema, type Schema as EmailSchema } from '@citizenry/email/schema'
import type { Bindings } from './env'

export type EmailVars = { db: DrizzleD1Database<EmailSchema> }

export const emailDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: EmailVars
}> = async (c, next) => {
  c.set('db', drizzle(c.env.DB_EMAIL, { schema: emailSchema }))
  await next()
}
