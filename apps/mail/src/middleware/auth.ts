// Bearer JWT auth — verifies against the identity Worker's `agent_key` table.
// Mirrors apps/api/src/middleware/auth.ts but trimmed (no enrollment / admin
// surfaces here).

import type { MiddlewareHandler } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { schema as identitySchema } from '@citizenry/identity/schema'
import { AuthError, verifyAgentJwt, type TokenPayload } from '@citizenry/identity/auth'
import type { Bindings } from '../env'

export type AuthVars = {
  /** Resolved on successful authentication. `sub` is the agent_id. */
  agentJwtPayload: TokenPayload
  /** Convenience: same as agentJwtPayload.sub. */
  accountId: string
}

type Ctx = Parameters<MiddlewareHandler>[0]

const PUBLIC_PATH_PREFIXES = ['/_health', '/.well-known/']

const isPublic = (path: string) => PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))

const unauthorized = (c: Ctx, err: AuthError) =>
  c.json(
    {
      title: 'Unauthorized',
      message: err.message,
      code: err.code,
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    401,
  )

const extractBearer = (c: Ctx): string | null => {
  const h = c.req.header('Authorization') || c.req.header('authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/)
  return m && m[1] ? m[1] : null
}

export const bearerAuth: MiddlewareHandler<{
  Bindings: Bindings
  Variables: AuthVars
}> = async (c, next) => {
  if (isPublic(c.req.path)) return next()

  const token = extractBearer(c)
  if (!token) {
    return unauthorized(c, new AuthError('ERR-P01-S01-0401', 'Authorization Bearer missing'))
  }

  const db = drizzle(c.env.DB_IDENTITY, { schema: identitySchema })
  const audience = (c.env.JWT_AUDIENCE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  try {
    const payload = await verifyAgentJwt(db, token, { audience })
    c.set('agentJwtPayload', payload)
    c.set('accountId', payload.sub)
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(c, err)
    throw err
  }
  await next()
}
