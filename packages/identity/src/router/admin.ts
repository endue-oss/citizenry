import { Hono } from 'hono'
import type { Db } from '../db'
import {
  mountAdminFederationRoutes,
  type FederationVars,
} from './federation'

type Vars = { db: Db } & Partial<FederationVars>

/**
 * Admin identity router.
 *
 * Routes (mirror the reference spec — exposed as-is when mounted at root):
 *   POST   /api/v1/enrollments              (X-Service-Key)
 *   DELETE /api/v1/enrollments/:id          (X-Service-Key)
 *   GET    /api/v1/admin/enrollments        (X-Service-Key, paginated)
 *   GET    /api/v1/admin/agents             (X-Service-Key, paginated)
 *   GET    /api/v1/admin/agents/:id         (X-Service-Key)
 *   DELETE /api/v1/admin/agents/:id         (X-Service-Key)
 *
 * Auth is handled by apps/admin-api middleware (X-Service-Key PSK verification).
 */
export const adminIdentityRouter = new Hono<{ Variables: Vars }>()
  // ── Enrollment issue / revoke ─────────────────────────
  .post('/api/v1/enrollments', (c) => c.json({ todo: 'create enrollment' }, 201))
  .delete('/api/v1/enrollments/:id', (c) => c.body(null, 204))

  // ── Admin enrollments list ────────────────────────────
  .get('/api/v1/admin/enrollments', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )

  // ── Admin agents list / get / force-revoke ────────────
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

// ── Federation admin surface (RFC-0001) ───────────────────
//   POST   /api/v1/admin/federation/peers
//   GET    /api/v1/admin/federation/peers
//   GET    /api/v1/admin/federation/peers/:id
//   POST   /api/v1/admin/federation/peers/:id/transition
//   DELETE /api/v1/admin/federation/peers/:id
//   POST   /api/v1/admin/federation/peers/:id/jwks-refresh
mountAdminFederationRoutes(
  adminIdentityRouter as unknown as Hono<{ Variables: FederationVars }>,
)
