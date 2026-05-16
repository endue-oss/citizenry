import { Hono } from 'hono'
import { identityRouter } from '@citizenry/identity'
import { vaultRouter } from '@citizenry/vault'
import type { Bindings } from './env'
import { identityDb, vaultDb, type IdentityVars, type VaultVars } from './db'
import { auth } from './middleware/auth'
import { cors } from './middleware/cors'
import { errorHandler } from './middleware/error'

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors)
app.use('*', auth)
app.onError(errorHandler)

app.get('/_health', (c) => c.json({ service: 'citizenry-api', status: 'ok' }))

// vault — D1, /vault 프리픽스
const vaultApp = new Hono<{ Bindings: Bindings; Variables: VaultVars }>()
  .use('*', vaultDb)
  .route('/', vaultRouter)
app.route('/vault', vaultApp)

// identity — Postgres + Hyperdrive, 라우트가 절대 경로 (/api/v1/agent/*, /.well-known/*, /agent/{id}/*)
// 라서 root 마운트
const identityApp = new Hono<{ Bindings: Bindings; Variables: IdentityVars }>()
  .use('*', identityDb)
  .route('/', identityRouter)
app.route('/', identityApp)

export default app
