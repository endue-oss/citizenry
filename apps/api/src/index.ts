import { Hono } from 'hono'
import { identityRouter, adminIdentityRouter } from '@citizenry/identity'
import { vaultRouter, adminVaultRouter } from '@citizenry/vault'
import type { Bindings } from './env'
import { identityDb, vaultDb, type IdentityVars, type VaultVars } from './db'
import { auth, serviceKeyAuth } from './middleware/auth'
import { cors } from './middleware/cors'
import { errorHandler } from './middleware/error'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors)
app.use('*', auth)
app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-api', status: 'ok' }))

// vault — D1, mounted under the /vault prefix
const vaultApp = new Hono<{ Bindings: Bindings; Variables: VaultVars }>()
  .use('*', vaultDb)
  .route('/', vaultRouter)
app.route('/vault', vaultApp)

// identity — D1; the routes are absolute (/api/v1/agent/*, /.well-known/*, /agent/{id}/*),
// so mount at the root.
const identityApp = new Hono<{ Bindings: Bindings; Variables: IdentityVars }>()
  .use('*', identityDb)
  .route('/', identityRouter)
app.route('/', identityApp)

// /_admin/* — admin-only. Validate the SERVICE_KEY header (X-Service-Key), then mount admin routers.
//   admin-api HTTP-proxies into this surface → api owns all admin logic.
//   admin vault routes:    /api/v1/admin/vault/*
//   admin identity routes: /api/v1/admin/{enrollments,agents,federation}/*,
//                          /api/v1/enrollments
//   Paths do not overlap, so the per-sub-app middleware (identityDb / vaultDb) stays cleanly separated.
const adminApp = new Hono<{ Bindings: Bindings }>().use('*', serviceKeyAuth)

const adminIdentityApp = new Hono<{ Bindings: Bindings; Variables: IdentityVars }>()
  .use('*', identityDb)
  .route('/', adminIdentityRouter)
adminApp.route('/', adminIdentityApp)

const adminVaultApp = new Hono<{ Bindings: Bindings; Variables: VaultVars }>()
  .use('*', vaultDb)
  .route('/', adminVaultRouter)
adminApp.route('/', adminVaultApp)

app.route('/_admin', adminApp)

export default app
