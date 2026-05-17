import { Hono } from 'hono'
import { adminIdentityRouter } from '@citizenry/identity/admin'
import { adminVaultRouter } from '@citizenry/vault/admin'
import type { Bindings } from './env'
import { identityDb, vaultDb, type IdentityVars, type VaultVars } from './db'
import { adminAuth } from './middleware/auth'
import { errorHandler } from './middleware/error'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', adminAuth)
app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-admin-api', status: 'ok' }))

// vault admin — D1. routes carry the full /api/v1/admin/vault path themselves.
const vaultApp = new Hono<{ Bindings: Bindings; Variables: VaultVars }>()
  .use('*', vaultDb)
  .route('/', adminVaultRouter)
app.route('/', vaultApp)

// identity admin — Postgres + Hyperdrive, 절대 경로 라우트
const identityApp = new Hono<{ Bindings: Bindings; Variables: IdentityVars }>()
  .use('*', identityDb)
  .route('/', adminIdentityRouter)
app.route('/', identityApp)

export default app
