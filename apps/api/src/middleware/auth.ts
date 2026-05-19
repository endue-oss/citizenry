import type { MiddlewareHandler } from 'hono'
import {
  AuthError,
  verifyAgentJwt,
  type TokenPayload,
} from '@citizenry/identity/auth'
import { drizzle } from 'drizzle-orm/d1'
import { schema } from '@citizenry/identity/schema'
import { ApiKeyError, createApiKeyService } from '@citizenry/identity'
import type { Bindings } from '../env'
import { hexToBytes, newApiKeyToken, newHumanApiKeyId } from '../ids'

export type ApiKeyActor = {
  humanPrincipalId: string
  apiKeyId: string
}

type AuthVars = {
  agentJwtPayload?: TokenPayload
  enrollmentToken?: string
  actor?: ApiKeyActor
}

// "Public" here means "global JWT/enrollment-bearer middleware does NOT
// run" — these routes either need no auth or carry their own
// per-route guard (e.g. apiKeyAuth on /v1/humans/:id/api-key/*,
// /v1/enrollments, /v1/agent/register).
const PUBLIC_PATH_PREFIXES = [
  '/_health',
  '/.well-known/',
  '/agent/',
  '/v1/humans',
  '/v1/enrollments',
  '/v1/agent/register',
]

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

  // /_admin/* is handled by the serviceKeyAuth middleware — skip agent JWT verification.
  if (path.startsWith('/_admin/')) return next()

  // body-JWS endpoints: header Bearer is irrelevant (the body JWS authenticates).
  if (
    (c.req.method === 'POST' && path === '/v1/agent/me/rotate-key') ||
    (c.req.method === 'DELETE' && path === '/v1/agent/me')
  ) {
    return next()
  }

  const bearer = extractBearer(c)
  if (!bearer) {
    return unauthorized(c, new AuthError('ERR-P01-S01-0401', 'Authorization Bearer missing'))
  }

  // ── Agent JWT verification (GET /me + /vault/*) ────────────────
  const db = drizzle(c.env.DB_IDENTITY, { schema })
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

/**
 * `/_admin/*` gate — admin-api calls in with the X-Service-Key header. Pass when PSK matches.
 * Comparison is constant-time (XOR diff).
 */
export const serviceKeyAuth: MiddlewareHandler<{
  Bindings: Bindings
  Variables: AuthVars
}> = async (c, next) => {
  const provided = c.req.header('X-Service-Key') || c.req.header('x-service-key') || ''
  const expected = c.env.SERVICE_KEY || ''
  if (!expected || !safeEqual(provided, expected)) {
    return unauthorized(
      c,
      new AuthError('ERR-P01-S01-0401', 'admin service key invalid or missing'),
    )
  }
  await next()
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const API_KEY_ERROR_CODE: Record<string, string> = {
  api_key_invalid: 'ERR-P01-S01-1040',
  api_key_revoked: 'ERR-P01-S01-1041',
  api_key_expired: 'ERR-P01-S01-1042',
  human_not_active: 'ERR-P01-S01-1043',
}

const apiKeyUnauthorized = (c: Ctx, err: ApiKeyError) =>
  c.json(
    {
      title: 'Unauthorized',
      message: err.message,
      detail: err.detail,
      code: API_KEY_ERROR_CODE[err.code] ?? 'ERR-P01-S01-0401',
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    401,
  )

/**
 * Per-route API-Key authenticator. Resolves `Authorization: Bearer
 * chk_…` to the owner human and sets `c.var.actor`. Routes that need a
 * verified-human caller (POST /v1/enrollments, DELETE /v1/enrollments/:id,
 * POST /v1/agent/register, POST /v1/humans/:id/api-key/revoke) mount
 * this in front of their handler.
 */
export const apiKeyAuth: MiddlewareHandler<{
  Bindings: Bindings
  Variables: AuthVars
}> = async (c, next) => {
  const bearer = extractBearer(c)
  if (!bearer) {
    return apiKeyUnauthorized(c, new ApiKeyError('api_key_invalid', 'Authorization Bearer missing'))
  }
  const db = drizzle(c.env.DB_IDENTITY, { schema })
  const svc = createApiKeyService({
    db,
    pepper: hexToBytes(c.env.ENROLLMENT_PEPPER),
    mintApiKeyId: newHumanApiKeyId,
    mintToken: newApiKeyToken,
  })
  try {
    const resolved = await svc.verify(bearer)
    c.set('actor', { humanPrincipalId: resolved.owner.principalId, apiKeyId: resolved.apiKeyId })
  } catch (err) {
    if (err instanceof ApiKeyError) return apiKeyUnauthorized(c, err)
    throw err
  }
  await next()
}
