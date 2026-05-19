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
 *   POST   /v1/enrollments              (X-Service-Key)
 *   DELETE /v1/enrollments/:id          (X-Service-Key)
 *   GET    /v1/admin/enrollments        (X-Service-Key, paginated)
 *   GET    /v1/admin/agents             (X-Service-Key, paginated)
 *   GET    /v1/admin/agents/:id         (X-Service-Key)
 *   DELETE /v1/admin/agents/:id         (X-Service-Key)
 *
 * Auth is handled by apps/admin-api middleware (X-Service-Key PSK verification).
 */
export const adminIdentityRouter = new Hono<{ Variables: Vars }>()
  // ── Enrollment issue / revoke ─────────────────────────
  .post('/v1/enrollments', (c) => c.json({ todo: 'create enrollment' }, 201))
  .delete('/v1/enrollments/:id', (c) => c.body(null, 204))

  // ── Admin enrollments list ────────────────────────────
  .get('/v1/admin/enrollments', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )

  // ── Admin agents list / get / force-revoke ────────────
  .get('/v1/admin/agents', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )
  .get('/v1/admin/agents/:id', (c) =>
    c.json({ todo: 'admin agent read', id: c.req.param('id') }),
  )
  .delete('/v1/admin/agents/:id', (c) => c.body(null, 204))

// ── Federation admin surface (RFC-0001) ───────────────────
//   POST   /v1/admin/federation/peers
//   GET    /v1/admin/federation/peers
//   GET    /v1/admin/federation/peers/:id
//   POST   /v1/admin/federation/peers/:id/transition
//   DELETE /v1/admin/federation/peers/:id
//   POST   /v1/admin/federation/peers/:id/jwks-refresh
mountAdminFederationRoutes(
  adminIdentityRouter as unknown as Hono<{ Variables: FederationVars }>,
)
