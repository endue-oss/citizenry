import { drizzle as drizzleD1, type DrizzleD1Database } from 'drizzle-orm/d1'
import type { MiddlewareHandler } from 'hono'
import { schema as identitySchema, type Schema as IdentitySchema } from '@citizenry/identity/schema'
import { schema as vaultSchema, type Schema as VaultSchema } from '@citizenry/vault/schema'
import type { Bindings } from './env'

export type IdentityVars = { db: DrizzleD1Database<IdentitySchema> }
export type VaultVars = { db: DrizzleD1Database<VaultSchema> }

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
