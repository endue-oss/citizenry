import { Hono } from 'hono'
import {
  identityRouter,
  adminIdentityRouter,
  humansRouter,
  type HumanRouterVars,
  registerRouter,
  type RegisterRouterVars,
} from '@citizenry/identity'
import { vaultRouter, adminVaultRouter } from '@citizenry/vault'
import { adminConfigRouter } from '@citizenry/config'
import type { TokenPayload } from '@citizenry/identity/auth'
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
import { auditAdmin } from './middleware/audit'
import { cors } from './middleware/cors'
import { errorHandler } from './middleware/error'
import { createNotifier } from './notifier'
import {
  newHumanId,
  newHumanVerificationId,
  newHumanApiKeyId,
  newApiKeyToken,
  newAgentId,
  newKid,
  hexToBytes,
} from './ids'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors)
app.use('*', auth)
app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-api', status: 'ok' }))

// vault — D1, mounted under the /vault prefix. The global `auth`
// middleware has already verified the agent JWT and set
// `agentJwtPayload` on the shared context; the vault router reads
// `sub` from it as the owning agent id.
const vaultApp = new Hono<{
  Bindings: Bindings
  Variables: VaultVars & { agentJwtPayload?: TokenPayload }
}>()
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
// All three /v1/humans/* routes are unauth (email round-trip is the
// credential). Rate-limit + enumeration defenses live inside the
// router. RFC-0004.
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
    await next()
  })
  .route('/', humansRouter)
app.route('/', humansApp)

// register — Bearer chk_ public surface. The body either supplies the
// client-keyed set (public_key_jwk + encryption_key_jwk + key_binding_jws)
// or asks the server to generate both the Ed25519 and X25519 keypairs.
// Middlewares are path-scoped to /v1/agent/register so the wildcard
// apiKeyAuth doesn't leak onto unrelated paths.
const registerApp = new Hono<{ Bindings: Bindings; Variables: RegisterRouterVars }>()
  .use('/v1/agent/register', identityDb)
  .use('/v1/agent/register', async (c, next) => {
    c.set('mintAgentId', newAgentId)
    c.set('mintKid', newKid)
    c.set('issuerHost', c.env.ISSUER_HOST)
    await next()
  })
  .use('/v1/agent/register', apiKeyAuth)
  .route('/', registerRouter)
app.route('/', registerApp)

// /_admin/* — admin-only. Validate the SERVICE_KEY header (X-Service-Key), then mount admin routers.
//   admin-api HTTP-proxies into this surface → api owns all admin logic.
//   admin vault routes:    /v1/admin/vault/*
//   admin identity routes: /v1/admin/{humans,agents,federation}/*
//   Paths do not overlap, so the per-sub-app middleware (identityDb / vaultDb) stays cleanly separated.
const adminApp = new Hono<{ Bindings: Bindings }>()
  .use('*', serviceKeyAuth)
  .use('*', auditAdmin)

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
