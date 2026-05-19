import { Hono } from 'hono'
import {
  identityRouter,
  adminIdentityRouter,
  humansRouter,
  type HumanRouterVars,
  enrollmentsRouter,
  type EnrollmentRouterVars,
} from '@citizenry/identity'
import { vaultRouter, adminVaultRouter } from '@citizenry/vault'
import { adminConfigRouter } from '@citizenry/config'
import type { Bindings } from './env'
import {
  identityDb,
  vaultDb,
  configDb,
  configReader,
  type IdentityVars,
  type VaultVars,
  type ConfigVars,
} from './db'
import { auth, serviceKeyAuth, apiKeyAuth } from './middleware/auth'
import { cors } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { createNotifier } from './notifier'
import {
  newHumanId,
  newHumanVerificationId,
  newHumanApiKeyId,
  newApiKeyToken,
  newEnrollmentId,
  newEnrollmentToken,
  hexToBytes,
} from './ids'

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

// identity — D1; the routes are absolute (/v1/agent/*, /.well-known/*, /agent/{id}/*),
// so mount at the root.
const identityApp = new Hono<{ Bindings: Bindings; Variables: IdentityVars }>()
  .use('*', identityDb)
  .route('/', identityRouter)
app.route('/', identityApp)

// humans — public self-registration with email verification. Mounted
// at root because the routes are absolute (/v1/humans*). See
// ADR-2026-0005 for the outbound-mail-via-mail-Worker design.
const humansApp = new Hono<{ Bindings: Bindings; Variables: HumanRouterVars }>()
  .use('*', identityDb)
  .use('*', configReader)
  .use('*', async (c, next) => {
    c.set('notifier', createNotifier(c.env))
    c.set('pepper', hexToBytes(c.env.ENROLLMENT_PEPPER))
    c.set('mintHumanId', newHumanId)
    c.set('mintVerificationId', newHumanVerificationId)
    c.set('mintApiKeyId', newHumanApiKeyId)
    c.set('mintApiKeyToken', newApiKeyToken)
    c.set('apiBaseUrl', c.env.API_BASE_URL || `https://${c.env.ISSUER_HOST}`)
    await next()
  })
  // Bearer chk_ guard for /api-key/* subroutes. Other /v1/humans/*
  // routes (create, verify, resend, find) stay unauthenticated.
  .use('/v1/humans/:id/api-key/*', apiKeyAuth)
  .route('/', humansRouter)
app.route('/', humansApp)

// enrollments — Bearer chk_ public surface. Owner is sourced from the
// caller's API-Key, so the request body carries no owner field.
const enrollmentsApp = new Hono<{ Bindings: Bindings; Variables: EnrollmentRouterVars }>()
  .use('*', identityDb)
  .use('*', async (c, next) => {
    c.set('pepper', hexToBytes(c.env.ENROLLMENT_PEPPER))
    c.set('mintEnrollmentId', newEnrollmentId)
    c.set('mintEnrollmentToken', newEnrollmentToken)
    await next()
  })
  .use('*', apiKeyAuth)
  .route('/', enrollmentsRouter)
app.route('/', enrollmentsApp)

// /_admin/* — admin-only. Validate the SERVICE_KEY header (X-Service-Key), then mount admin routers.
//   admin-api HTTP-proxies into this surface → api owns all admin logic.
//   admin vault routes:    /v1/admin/vault/*
//   admin identity routes: /v1/admin/{enrollments,agents,federation}/*,
//                          /v1/enrollments
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

const adminConfigApp = new Hono<{ Bindings: Bindings; Variables: ConfigVars }>()
  .use('*', configDb)
  .route('/', adminConfigRouter)
adminApp.route('/', adminConfigApp)

app.route('/_admin', adminApp)

export default app
