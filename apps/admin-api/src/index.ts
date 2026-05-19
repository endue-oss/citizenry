// citizenry-admin-api — operator-facing admin console gateway.
//
// External contract:
//   GET  /_health                          — public probe
//   POST /auth/login                       — admin_id + password → JWT pair
//   POST /auth/refresh                     — refresh_token → new JWT pair
//   POST /auth/logout                      — revoke a refresh token
//   GET  /auth/me                          — current admin claims (Bearer)
//   *    /v1/admin/*                   — JWT-protected, proxied to api
//
// Internal hop (admin-api → api) still rides X-Service-Key, so the api
// worker can authenticate calls coming from this gateway separately
// from end-operator credentials.

import { Hono } from 'hono'
import type { Bindings } from './env'
import { errorHandler } from './middleware/error'
import { adminJwtAuth, type AuthVars } from './middleware/auth'
import { authRouter, meRouter } from './routes/auth'

const app = new Hono<{ Bindings: Bindings }>()

app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-admin-api', status: 'ok' }))

// /auth/* — login, refresh, logout, me. The `meRouter` carries its own
// JWT middleware; everything else under /auth is unauthenticated by
// design (the credentials in the body are the auth).
app.route('/', authRouter)
app.route('/', meRouter)

// JWT-protected proxy for /v1/admin/*.
//
// The middleware verifies a Bearer access token signed with
// ADMIN_JWT_SECRET; the request is then forwarded via the API service
// binding with an X-Service-Key header plus an X-Admin-Id breadcrumb.
// The original Authorization header is NOT forwarded — the api worker
// authenticates the hop with SERVICE_KEY only.
const proxied = new Hono<{ Bindings: Bindings; Variables: AuthVars }>()
  .use('*', adminJwtAuth)
  .all('*', async (c) => {
    const url = new URL(c.req.url)
    const target = `https://api${'/_admin' + url.pathname}${url.search}`

    const upstreamHeaders = new Headers()
    upstreamHeaders.set('X-Service-Key', c.env.SERVICE_KEY)
    upstreamHeaders.set('X-Admin-Id', c.var.adminClaims.sub)
    const ct = c.req.header('Content-Type')
    if (ct) upstreamHeaders.set('Content-Type', ct)
    const accept = c.req.header('Accept')
    if (accept) upstreamHeaders.set('Accept', accept)

    const body =
      c.req.method === 'GET' || c.req.method === 'HEAD'
        ? undefined
        : await c.req.arrayBuffer()

    const upstream = await c.env.API.fetch(target, {
      method: c.req.method,
      headers: upstreamHeaders,
      body,
    })

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    })
  })

// Mount under the admin prefix. `c.req.url` inside the proxied handler
// retains the full original URL, which is what we need to construct
// the upstream `/_admin/v1/admin/...` path.
app.route('/v1/admin', proxied)

export default app
