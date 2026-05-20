// Client-side admin session: access token + refresh token + decoded
// claims, kept in a Svelte writable store and mirrored to localStorage.
//
// This is intentionally client-only — the admin-api emits JWT pairs
// rather than HTTP cookies, so admin-web is a thin trust-no-server SPA
// that holds the tokens itself. SSR contexts (load functions) treat
// "no session" as the default and rely on the layout effect to redirect
// to /login.

import { browser } from '$app/environment'
import { writable } from 'svelte/store'

const STORAGE_KEY = 'citizenry.admin.session.v1'

export type AdminClaims = {
  /** Admin subject id, e.g. `admin@example.com` (operator-configurable). */
  sub: string
  /** Issued-at, unix seconds. */
  iat: number
  /** Expiry, unix seconds. */
  exp: number
}

export type AdminSession = {
  accessToken: string
  refreshToken: string
  claims: AdminClaims
}

function decodeClaims(jwt: string): AdminClaims | null {
  const parts = jwt.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = parts[1]!
    // base64url → base64 → JSON
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      '=',
    )
    const json = atob(b64)
    const obj = JSON.parse(json) as Partial<AdminClaims>
    if (
      typeof obj.sub !== 'string' ||
      typeof obj.iat !== 'number' ||
      typeof obj.exp !== 'number'
    ) {
      return null
    }
    return { sub: obj.sub, iat: obj.iat, exp: obj.exp }
  } catch {
    return null
  }
}

function readInitial(): AdminSession | null {
  if (!browser) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AdminSession>
    if (
      typeof parsed.accessToken !== 'string' ||
      typeof parsed.refreshToken !== 'string'
    ) {
      return null
    }
    const claims = decodeClaims(parsed.accessToken)
    if (!claims) return null
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      claims,
    }
  } catch {
    return null
  }
}

export const session = writable<AdminSession | null>(readInitial())

if (browser) {
  // Persist every store change to localStorage so other tabs can pick
  // it up via the `storage` event below.
  session.subscribe((s) => {
    if (s) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: s.accessToken, refreshToken: s.refreshToken }),
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  })

  // Cross-tab sync. The `storage` event only fires in OTHER tabs, so
  // this is safe from re-entry. When a peer tab refreshes or signs out
  // we mirror that here, which keeps the layout guard accurate.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return
    const next = readInitial()
    session.set(next)
  })
}

export function setSession(accessToken: string, refreshToken: string): AdminSession | null {
  const claims = decodeClaims(accessToken)
  if (!claims) {
    session.set(null)
    return null
  }
  const next: AdminSession = { accessToken, refreshToken, claims }
  session.set(next)
  return next
}

export function clearSession(): void {
  session.set(null)
}

/** Read the latest session value synchronously. */
export function getSession(): AdminSession | null {
  let value: AdminSession | null = null
  session.subscribe((s) => {
    value = s
  })()
  return value
}

/** True when an access token exists and is not past its `exp`. */
export function isAuthenticated(s: AdminSession | null = getSession()): boolean {
  if (!s) return false
  const nowSec = Math.floor(Date.now() / 1000)
  return s.claims.exp > nowSec
}

/**
 * True when the session has both tokens — i.e. it is *worth* trying
 * to call `/auth/refresh`. The layout guard uses this (instead of
 * {@link isAuthenticated}) so an expired access token does not
 * silently bounce the user to /login when the refresh token is still
 * viable. The api fetch wrapper will handle the actual 401 → refresh
 * dance; this just keeps the guard from kicking too early.
 */
export function hasUsableSession(
  s: AdminSession | null = getSession(),
): boolean {
  return !!s && typeof s.refreshToken === 'string' && s.refreshToken.length > 0
}

/**
 * Seconds until the current access token expires (negative if past
 * `exp`). Used to decide when to proactively trigger a refresh before
 * the first 401 round-trip.
 */
export function accessExpiresInSec(
  s: AdminSession | null = getSession(),
): number {
  if (!s) return -1
  return s.claims.exp - Math.floor(Date.now() / 1000)
}
