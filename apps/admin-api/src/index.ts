import { Hono } from 'hono'
import type { Bindings } from './env'
import { adminAuth } from './middleware/auth'
import { errorHandler } from './middleware/error'

const app = new Hono<{ Bindings: Bindings }>()

app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-admin-api', status: 'ok' }))

app.use('*', adminAuth)

/**
 * Proxy every admin request to api's `/_admin{path}`.
 *
 * Flow:
 *   inbound:  client → admin-api (validated by adminAuth middleware)
 *   outbound: admin-api → api/_admin/* (X-Service-Key: SERVICE_KEY)
 *
 * External surface: the original admin route path verbatim (e.g. GET /api/v1/admin/agents).
 * Internal call:    API_BASE_URL + "/_admin" + originalPath.
 *
 * The inbound Authorization (and similar) headers are not forwarded — api's
 * admin routes only check SERVICE_KEY, so we avoid leaking extra tokens.
 */
app.all('*', async (c) => {
  const base = (c.env.API_BASE_URL || '').replace(/\/$/, '')
  if (!base) {
    return c.json(
      { code: 'misconfigured', message: 'API_BASE_URL not set on admin-api' },
      500,
    )
  }

  const url = new URL(c.req.url)
  const target = `${base}/_admin${url.pathname}${url.search}`

  const upstreamHeaders = new Headers()
  upstreamHeaders.set('X-Service-Key', c.env.SERVICE_KEY)
  const ct = c.req.header('Content-Type')
  if (ct) upstreamHeaders.set('Content-Type', ct)
  const accept = c.req.header('Accept')
  if (accept) upstreamHeaders.set('Accept', accept)

  const body =
    c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : await c.req.arrayBuffer()

  const upstream = await fetch(target, {
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

export default app
