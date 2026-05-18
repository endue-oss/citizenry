import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import { schema as mailSchema, type Schema as MailSchema } from '@citizenry/mail/schema'
import type { Bindings } from './env'

export type MailVars = { db: DrizzleD1Database<MailSchema> }

export const mailDb: MiddlewareHandler<{
  Bindings: Bindings
  Variables: MailVars
}> = async (c, next) => {
  c.set('db', drizzle(c.env.DB_MAIL, { schema: mailSchema }))
  await next()
}
