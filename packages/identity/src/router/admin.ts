import { Hono } from 'hono'
import type { Db } from '../db'

type Vars = { db: Db }

/**
 * Admin identity router.
 *
 * 라우트 (참조 spec 와 동일 — root 마운트 시 그대로 노출):
 *   POST   /api/v1/enrollments              (X-Service-Key)
 *   DELETE /api/v1/enrollments/:id          (X-Service-Key)
 *   GET    /api/v1/admin/enrollments        (X-Service-Key, paginated)
 *   GET    /api/v1/admin/agents             (X-Service-Key, paginated)
 *   GET    /api/v1/admin/agents/:id         (X-Service-Key)
 *   DELETE /api/v1/admin/agents/:id         (X-Service-Key)
 *
 * 인증은 apps/admin-api 의 미들웨어가 처리 (X-Service-Key PSK 검증).
 */
export const adminIdentityRouter = new Hono<{ Variables: Vars }>()
  // ── Enrollment 발급 / 폐기 ────────────────────────────
  .post('/api/v1/enrollments', (c) => c.json({ todo: 'create enrollment' }, 201))
  .delete('/api/v1/enrollments/:id', (c) => c.body(null, 204))

  // ── Admin enrollments 목록 ────────────────────────────
  .get('/api/v1/admin/enrollments', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )

  // ── Admin agents 목록 / 조회 / 강제 폐기 ──────────────
  .get('/api/v1/admin/agents', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )
  .get('/api/v1/admin/agents/:id', (c) =>
    c.json({ todo: 'admin agent read', id: c.req.param('id') }),
  )
  .delete('/api/v1/admin/agents/:id', (c) => c.body(null, 204))
