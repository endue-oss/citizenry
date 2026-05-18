// /auth/* — login, refresh, logout, me.
//
// These routes are owned by admin-api (no proxy to api). The
// underlying credential check + refresh registry lives in
// `@citizenry/identity`; this layer is responsible for HTTP shape,
// JWT minting, and translating service errors into RFC 9457-shaped
// responses.
//
// Password storage: plaintext in the config D1 under key
// `admin.password`. The cached config reader (`c.var.config`) is
// passed to admin_auth as `getAdminPassword` so reads piggyback on
// the 5-minute colo-local TTL.

import { Hono } from 'hono'
import {
  createAdminAuthService,
  AdminAuthErrorResult,
  type AdminAuthError,
} from '@citizenry/identity'
import type { Bindings } from '../env'
import { signAccessToken } from '../tokens'
import { adminJwtAuth, type AuthVars } from '../middleware/auth'
import { configReader, identityDb, type ConfigReaderVars, type IdentityVars } from '../db'

type Vars = IdentityVars & ConfigReaderVars

const ADMIN_PASSWORD_KEY = 'admin.password'

const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('hex length must be even')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

const errResponse = (kind: AdminAuthError): { status: 401 | 400; body: object } => {
  const map: Record<AdminAuthError, { code: string; message: string }> = {
    invalid_credentials: {
      code: 'ERR-P01-ADM-2001',
      message: 'invalid admin id or password',
    },
    invalid_refresh_token: {
      code: 'ERR-P01-ADM-2002',
      message: 'refresh token is unknown or malformed',
    },
    refresh_expired: {
      code: 'ERR-P01-ADM-2003',
      message: 'refresh token has expired',
    },
    refresh_replay_detected: {
      code: 'ERR-P01-ADM-2004',
      message: 'refresh token replay detected — all sessions revoked',
    },
  }
  return {
    status: 401,
    body: {
      title: 'Unauthorized',
      ...map[kind],
      timestamp: new Date().toISOString(),
    },
  }
}

const makeService = (c: {
  env: Bindings
  var: Vars
}) =>
  createAdminAuthService({
    db: c.var.db,
    adminId: c.env.ADMIN_ID,
    getAdminPassword: async () => {
      const entry = await c.var.config.get<string>(ADMIN_PASSWORD_KEY)
      return entry?.value ?? null
    },
    refreshPepper: hexToBytes(c.env.ADMIN_REFRESH_PEPPER),
  })

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Vars }>()
  .use('*', identityDb)
  .use('*', configReader)

  // ── POST /auth/login ─────────────────────────────────
  .post('/auth/login', async (c) => {
    let body: { admin_id?: unknown; password?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'ERR-P01-ADM-2000', message: 'invalid json' }, 400)
    }
    if (typeof body.admin_id !== 'string' || typeof body.password !== 'string') {
      return c.json(
        { code: 'ERR-P01-ADM-2000', message: 'admin_id and password required' },
        400,
      )
    }
    const svc = makeService(c)
    try {
      const result = await svc.login({
        adminId: body.admin_id,
        password: body.password,
      })
      const access = await signAccessToken({
        secret: c.env.ADMIN_JWT_SECRET,
        adminId: result.adminId,
        ttlSecs: Number(c.env.ACCESS_TOKEN_TTL_SECS) || 900,
      })
      return c.json({
        admin_id: result.adminId,
        access_token: access.token,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: Number(c.env.ACCESS_TOKEN_TTL_SECS) || 900,
        refresh_expires_at: result.refreshTokenRow.expiresAt.toISOString(),
      })
    } catch (err) {
      if (err instanceof AdminAuthErrorResult) {
        const { status, body: payload } = errResponse(err.kind)
        return c.json(payload, status)
      }
      throw err
    }
  })

  // ── POST /auth/refresh ───────────────────────────────
  .post('/auth/refresh', async (c) => {
    let body: { refresh_token?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ code: 'ERR-P01-ADM-2000', message: 'invalid json' }, 400)
    }
    if (typeof body.refresh_token !== 'string') {
      return c.json(
        { code: 'ERR-P01-ADM-2000', message: 'refresh_token required' },
        400,
      )
    }
    const svc = makeService(c)
    try {
      const result = await svc.refresh(body.refresh_token)
      const access = await signAccessToken({
        secret: c.env.ADMIN_JWT_SECRET,
        adminId: result.adminId,
        ttlSecs: Number(c.env.ACCESS_TOKEN_TTL_SECS) || 900,
      })
      return c.json({
        admin_id: result.adminId,
        access_token: access.token,
        refresh_token: result.refreshToken,
        token_type: 'Bearer',
        expires_in: Number(c.env.ACCESS_TOKEN_TTL_SECS) || 900,
        refresh_expires_at: result.refreshTokenRow.expiresAt.toISOString(),
      })
    } catch (err) {
      if (err instanceof AdminAuthErrorResult) {
        const { status, body: payload } = errResponse(err.kind)
        return c.json(payload, status)
      }
      throw err
    }
  })

  // ── POST /auth/logout ────────────────────────────────
  .post('/auth/logout', async (c) => {
    let body: { refresh_token?: unknown } = {}
    try {
      body = await c.req.json()
    } catch {
      // ignore — logout body is optional
    }
    if (typeof body.refresh_token === 'string') {
      const svc = makeService(c)
      await svc.revoke(body.refresh_token)
    }
    return c.body(null, 204)
  })

// ── GET /auth/me ────────────────────────────────────────
// Returns the claims of the presenting access token. JWT-protected
// like the rest of /api/v1/admin/*. Lives on the auth router for
// route locality.
export const meRouter = new Hono<{ Bindings: Bindings; Variables: AuthVars }>()
  .use('*', adminJwtAuth)
  .get('/auth/me', (c) => {
    const claims = c.var.adminClaims
    return c.json({
      admin_id: claims.sub,
      issued_at: new Date(claims.iat * 1000).toISOString(),
      expires_at: new Date(claims.exp * 1000).toISOString(),
      jti: claims.jti,
    })
  })
