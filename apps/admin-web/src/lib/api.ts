// Typed fetch wrapper for admin-api.
//
// All requests except /auth/login auto-attach `Authorization: Bearer
// <access>`. On a 401, the client transparently tries POST /auth/refresh
// once with the stored refresh token, swaps the session, and retries
// the original request. Terminal refresh failure clears the session so
// the layout guard kicks the user back to /login.

import { env } from '$env/dynamic/public'
import {
  accessExpiresInSec,
  clearSession,
  getSession,
  setSession,
  type AdminSession,
} from './session'

const PUBLIC_ADMIN_API_BASE_URL = env.PUBLIC_ADMIN_API_BASE_URL ?? ''

export type ApiError = {
  status: number
  title?: string
  message: string
  code?: string
  detail?: unknown
}

export class AdminApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly detail?: unknown
  constructor(payload: ApiError) {
    super(payload.message)
    this.name = 'AdminApiError'
    this.status = payload.status
    this.code = payload.code
    this.detail = payload.detail
  }
}

const BASE = (PUBLIC_ADMIN_API_BASE_URL || '').replace(/\/+$/, '')

function url(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!BASE) {
    // Empty means the Pages project env var was never set: every call
    // would silently 404 against the app's own origin. Fail with an
    // actionable message instead (it surfaces on the login screen).
    throw new AdminApiError({
      status: 0,
      message:
        'PUBLIC_ADMIN_API_BASE_URL is not configured — set it on the Pages project (or in .env for local dev) and rebuild. See docs/deploy.md.',
    })
  }
  if (!path.startsWith('/')) path = `/${path}`
  return `${BASE}${path}`
}

async function readError(res: Response): Promise<ApiError> {
  const fallback: ApiError = { status: res.status, message: res.statusText || `HTTP ${res.status}` }
  try {
    const body = (await res.json()) as Partial<ApiError> & { message?: string; title?: string }
    return {
      status: res.status,
      title: body.title,
      message: body.message ?? fallback.message,
      code: body.code,
      detail: body.detail,
    }
  } catch {
    return fallback
  }
}

let inflightRefresh: Promise<AdminSession | null> | null = null

async function refreshOnce(): Promise<AdminSession | null> {
  if (inflightRefresh) return inflightRefresh
  inflightRefresh = (async () => {
    const cur = getSession()
    if (!cur) return null
    try {
      const res = await fetch(url('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: cur.refreshToken }),
      })
      if (!res.ok) {
        clearSession()
        return null
      }
      const body = (await res.json()) as { access_token: string; refresh_token: string }
      return setSession(body.access_token, body.refresh_token)
    } catch {
      clearSession()
      return null
    } finally {
      inflightRefresh = null
    }
  })()
  return inflightRefresh
}

type RequestInitWithJson = Omit<RequestInit, 'body'> & { json?: unknown }

// Refresh proactively if the access token has 30s or less left. Saves
// one 401 round-trip on the common "tab idle for 15 minutes" case and
// keeps long requests from racing the expiry boundary.
const PROACTIVE_REFRESH_WINDOW_SEC = 30

async function request<T>(path: string, init: RequestInitWithJson = {}): Promise<T> {
  const send = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers ?? {})
    if (init.json !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const body = init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body
    return fetch(url(path), { ...init, headers, body })
  }

  let cur = getSession()

  // Proactive refresh — avoid the 401 round-trip when we already know
  // the token is about to (or did) expire.
  if (cur && accessExpiresInSec(cur) <= PROACTIVE_REFRESH_WINDOW_SEC) {
    const refreshed = await refreshOnce()
    if (refreshed) cur = refreshed
    else cur = getSession()  // refresh failed → cur is now null
  }

  let res = await send(cur?.accessToken ?? null)

  // Reactive refresh — server-decided 401 (clock skew, revoked etc.).
  if (res.status === 401 && getSession()) {
    const refreshed = await refreshOnce()
    if (refreshed) {
      res = await send(refreshed.accessToken)
    }
  }

  if (!res.ok) throw new AdminApiError(await readError(res))
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('Content-Type') ?? ''
  if (ct.includes('application/json')) {
    return (await res.json()) as T
  }
  return (await res.text()) as unknown as T
}

/**
 * Public refresh entry point. Used by the root layout's boot routine
 * when it wants to confirm the session is still good before deciding
 * whether to redirect to /login.
 */
export async function ensureFreshSession(): Promise<AdminSession | null> {
  const cur = getSession()
  if (!cur) return null
  if (accessExpiresInSec(cur) > PROACTIVE_REFRESH_WINDOW_SEC) return cur
  return refreshOnce()
}

// ── typed endpoints ─────────────────────────────────────────────────

export type LoginRequest = { admin_id: string; password: string }
export type LoginResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export const adminApi = {
  baseUrl: BASE,

  async login(input: LoginRequest): Promise<LoginResponse> {
    const res = await fetch(url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new AdminApiError(await readError(res))
    const body = (await res.json()) as LoginResponse
    setSession(body.access_token, body.refresh_token)
    return body
  },

  async logout(): Promise<void> {
    const cur = getSession()
    if (!cur) return
    try {
      await fetch(url('/auth/logout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cur.accessToken}`,
        },
        body: JSON.stringify({ refresh_token: cur.refreshToken }),
      })
    } catch {
      // Best-effort — even if the server is unreachable we still
      // drop the local session so the UI returns to /login.
    }
    clearSession()
  },

  /**
   * Matches the server response shape from
   * `apps/admin-api/src/routes/auth.ts` — note the field names are
   * snake-case and timestamps are ISO strings (not the unix seconds
   * carried inside the JWT body itself).
   */
  me(): Promise<{
    admin_id: string
    issued_at: string
    expires_at: string
    jti: string
  }> {
    return request('/auth/me', { method: 'GET' })
  },

  /**
   * Pass-through for `/v1/admin/*` proxy routes. Accepts a body via
   * `json` (auto-serialized + Content-Type).
   */
  call<T = unknown>(path: string, init: RequestInitWithJson = {}): Promise<T> {
    return request<T>(path, init)
  },
}
