import type { MiddlewareHandler } from 'hono'
import {
  AuthError,
  checkEnrollmentBearerShape,
  verifyAgentJwt,
  type TokenPayload,
} from '@citizenry/identity/auth'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { schema } from '@citizenry/identity/schema'
import type { Bindings } from '../env'

type AuthVars = {
  agentJwtPayload?: TokenPayload
  enrollmentToken?: string
}

const PUBLIC_PATH_PREFIXES = ['/_health', '/.well-known/', '/agent/']

const isPublic = (path: string): boolean =>
  PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))

type Ctx = Parameters<MiddlewareHandler>[0]

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

export const auth: MiddlewareHandler<{
  Bindings: Bindings
  Variables: AuthVars
}> = async (c, next) => {
  const path = c.req.path
  if (isPublic(path)) return next()

  // body-JWS endpoints: header Bearer 무관 (본문 JWS 가 인증)
  if (
    (c.req.method === 'POST' && path === '/api/v1/agent/me/rotate-key') ||
    (c.req.method === 'DELETE' && path === '/api/v1/agent/me')
  ) {
    return next()
  }

  const bearer = extractBearer(c)
  if (!bearer) {
    return unauthorized(c, new AuthError('ERR-P01-S01-0401', 'Authorization Bearer missing'))
  }

  // ── Register: enrollment Bearer 형식만 확인 ─────────────
  if (path === '/api/v1/agent/register') {
    try {
      checkEnrollmentBearerShape(bearer)
    } catch (err) {
      return unauthorized(c, err as AuthError)
    }
    c.set('enrollmentToken', bearer)
    return next()
  }

  // ── Agent JWT 검증 (GET /me + /vault/*) ────────────────
  const client = postgres(c.env.HYPERDRIVE.connectionString, {
    prepare: false,
    max: 5,
    fetch_types: false,
  })
  const db = drizzle(client, { schema })
  const audience = (c.env.JWT_AUDIENCE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  try {
    const payload = await verifyAgentJwt(db, bearer, { audience })
    c.set('agentJwtPayload', payload)
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(c, err)
    throw err
  }
  await next()
}
