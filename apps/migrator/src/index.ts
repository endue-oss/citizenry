// citizenry-migrator — D1 (identity + vault) 마이그레이션 실행 worker.
//
// 운영 흐름:
//   CI (deploy.yml) 가 이 worker 를 먼저 배포한 뒤, MIGRATOR_TOKEN 으로
//   POST /apply 를 호출한다. 응답 JSON 에 파일별 status 가 있고, 하나라도
//   `failed` 면 HTTP 500 으로 응답한다. CI 는 그걸 보고 다음 단계 (앱
//   worker 배포) 를 진행하거나 중단한다.
//
// 라우트:
//   GET  /_health   — 무인증, version & migration count
//   GET  /status    — 인증, identity/vault 각 파일의 applied | pending | drifted
//   POST /apply     — 인증, identity → vault 순으로 미적용 파일 적용

import { Hono, type MiddlewareHandler } from 'hono'
import type { Bindings } from './env'
import { applyD1, statusD1 } from './runner'
import { identityMigrations, vaultMigrations } from './migrations.generated'

const app = new Hono<{ Bindings: Bindings }>()

// ── auth ────────────────────────────────────────────────────────────
// 상수시간 비교. Workers 글로벌엔 `crypto.timingSafeEqual` 이 없어서 직접 짠다.
// MIGRATOR_TOKEN 은 32B (64 hex) 정도라 비용은 무시 가능.
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
  }),
)

// 인증이 필요한 라우트만 게이트한다 — health 는 public.
app.use('/status', bearerAuth)
app.use('/apply', bearerAuth)

app.get('/status', async (c) => {
  const [identity, vault] = await Promise.all([
    statusD1(c.env.DB_IDENTITY, identityMigrations),
    statusD1(c.env.DB_VAULT, vaultMigrations),
  ])
  return c.json({ identity, vault })
})

app.post('/apply', async (c) => {
  // identity 먼저 — 향후 vault 가 identity 의 principal_id 같은 외부 참조를
  // 가질 수 있어 의존 순서를 고정한다.
  const identity = await applyD1(c.env.DB_IDENTITY, identityMigrations)
  const vault = await applyD1(c.env.DB_VAULT, vaultMigrations)

  const failed = [...identity, ...vault].some((r) => r.status === 'failed')
  return c.json({ ok: !failed, identity, vault }, failed ? 500 : 200)
})

export default app
