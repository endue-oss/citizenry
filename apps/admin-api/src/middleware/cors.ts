// CORS for the admin-api gateway.
//
// admin-web (SvelteKit, dev port 3001) hits admin-api directly from the
// browser, so we need to advertise allowed origins and answer the
// preflight OPTIONS that the browser sends ahead of every JSON POST.
//
// Production origins (custom domains / pages.dev) are added here as
// adopters deploy. Wildcards are intentionally avoided so cookies and
// `Authorization` headers stay scoped.

import { cors as honoCors } from 'hono/cors'

// Static dev origins. Production Pages origins are matched dynamically
// below (the project alias plus the immutable per-deployment hashes
// `<hash>.citizenry-admin-web.pages.dev`).
const STATIC_ORIGINS = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
])

// Allow only this project's pages.dev subdomains — the bare alias and
// any `<hash>.citizenry-admin-web.pages.dev`. Avoids a blanket wildcard
// so cookies and `Authorization` headers stay scoped.
const PAGES_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?citizenry-admin-web\.pages\.dev$/

export const cors = honoCors({
  origin: (origin) => {
    if (!origin) return null
    if (STATIC_ORIGINS.has(origin)) return origin
    if (PAGES_ORIGIN.test(origin)) return origin
    return null
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Service-Key'],
  credentials: true,
})
