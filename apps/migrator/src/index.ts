// citizenry-migrator — worker that runs D1 (identity + vault + email) migrations.
//
// Operational flow:
//   CI (deploy.yml) deploys this worker first, then calls POST /apply
//   with MIGRATOR_TOKEN. The response JSON carries a per-file status;
//   if any entry is `failed`, the worker responds HTTP 500. CI uses that
//   to decide whether to proceed with the next step (app worker deploy)
//   or abort.
//
// Routes:
//   GET  /_health   — unauthenticated, version & migration count
//   GET  /status    — authenticated, applied | pending | drifted per file (identity/vault/email)
//   POST /apply     — authenticated, applies pending files in identity → vault → email order

import { Hono, type MiddlewareHandler } from 'hono'
import type { Bindings } from './env'
import { applyD1, statusD1 } from './runner'
import { emailMigrations, identityMigrations, vaultMigrations } from './migrations.generated'

const app = new Hono<{ Bindings: Bindings }>()

// ── auth ────────────────────────────────────────────────────────────
// Constant-time compare. The Workers global lacks `crypto.timingSafeEqual`,
// so roll our own. MIGRATOR_TOKEN is ~32B (64 hex), so cost is negligible.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const bearerAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const expected = c.env.MIGRATOR_TOKEN
  if (!expected || !safeEqual(presented, expected)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}

app.get('/_health', (c) =>
  c.json({
    service: 'citizenry-migrator',
    status: 'ok',
    identity_migrations: identityMigrations.length,
    vault_migrations: vaultMigrations.length,
    email_migrations: emailMigrations.length,
  }),
)

// Gate only the routes that require auth — health is public.
app.use('/status', bearerAuth)
app.use('/apply', bearerAuth)

app.get('/status', async (c) => {
  const [identity, vault, email] = await Promise.all([
    statusD1(c.env.DB_IDENTITY, identityMigrations),
    statusD1(c.env.DB_VAULT, vaultMigrations),
    statusD1(c.env.DB_EMAIL, emailMigrations),
  ])
  return c.json({ identity, vault, email })
})

app.post('/apply', async (c) => {
  // identity first — vault and email both look up agent rows from identity,
  // so the dependency order is pinned.
  const identity = await applyD1(c.env.DB_IDENTITY, identityMigrations)
  const vault = await applyD1(c.env.DB_VAULT, vaultMigrations)
  const email = await applyD1(c.env.DB_EMAIL, emailMigrations)

  const failed = [...identity, ...vault, ...email].some((r) => r.status === 'failed')
  return c.json({ ok: !failed, identity, vault, email }, failed ? 500 : 200)
})

export default app
