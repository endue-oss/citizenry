// JWT bearer middleware for admin-api.
//
// Replaces the previous X-Service-Key middleware on the public surface.
// SERVICE_KEY is still used outbound (admin-api → api), but the
// inbound contract is now a Bearer access token signed with
// ADMIN_JWT_SECRET.

import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../env'
import { verifyAccessToken, type AccessTokenClaims } from '../tokens'

export type AuthVars = { adminClaims: AccessTokenClaims }

const errBody = (
  c: Parameters<MiddlewareHandler>[0],
  message: string,
  code: string,
) => ({
  title: 'Unauthorized',
  message,
  code,
  method: c.req.method,
  instance: c.req.path,
  request_url: c.req.url,
  timestamp: new Date().toISOString(),
})

export const adminJwtAuth: MiddlewareHandler<{
  Bindings: Bindings
  Variables: AuthVars
}> = async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) {
    return c.json(
      errBody(c, 'missing bearer token', 'ERR-P01-ADM-1001'),
      401,
    )
  }
  const token = header.slice('Bearer '.length).trim()
  const result = await verifyAccessToken(token, c.env.ADMIN_JWT_SECRET)
  if (!result.ok) {
    const code =
      result.reason === 'expired' ? 'ERR-P01-ADM-1002' : 'ERR-P01-ADM-1003'
    const message =
      result.reason === 'expired'
        ? 'access token expired'
        : 'invalid access token'
    return c.json(errBody(c, message, code), 401)
  }
  c.set('adminClaims', result.claims)
  await next()
}
