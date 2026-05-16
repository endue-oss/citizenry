import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../env'

export const auth: MiddlewareHandler<{ Bindings: Bindings }> = async (_c, next) => {
  // TODO: extract bearer token, verify via @citizenry/identity/auth, set user on context.
  await next()
}
