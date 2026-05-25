import { Hono } from 'hono'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { agent, auditLog, human } from '../db/schema'
import {
  mountAdminFederationRoutes,
  type FederationVars,
} from './federation'

type Vars = { db: Db } & Partial<FederationVars>

function paginate(c: { req: { query(name: string): string | undefined } }) {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(c.req.query('limit') ?? '50', 10) || 50),
  )
  return { page, limit, offset: (page - 1) * limit }
}

/**
 * Admin identity router.
 *
 * Routes (mirror the reference spec — exposed as-is when mounted at root):
 *   GET    /v1/admin/humans             (X-Service-Key, paginated)
 *   GET    /v1/admin/humans/:id         (X-Service-Key)
 *   GET    /v1/admin/agents             (X-Service-Key, paginated)
 *   GET    /v1/admin/agents/:id         (X-Service-Key)
 *   DELETE /v1/admin/agents/:id         (X-Service-Key)
 *
 * Auth here is handled by apps/admin-api middleware (X-Service-Key).
 */
export const adminIdentityRouter = new Hono<{ Variables: Vars }>()
  // ── Admin humans list / get ──────────────────────────
  .get('/v1/admin/humans', async (c) => {
    const { page, limit, offset } = paginate(c)
    const db = c.var.db
    const totalRow = await db
      .select({ n: sql<number>`count(*)`.as('n') })
      .from(human)
    const total = Number(totalRow[0]?.n ?? 0)
    const rows = await db
      .select()
      .from(human)
      .orderBy(desc(human.createdAt))
      .limit(limit)
      .offset(offset)
    return c.json({
      items: rows.map((r) => ({
        id: r.principalId,
        email: r.email,
        display_name: r.displayName,
        status: r.status,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        has_next_page: offset + rows.length < total,
      },
    })
  })
  .get('/v1/admin/humans/:id', async (c) => {
    const rows = await c.var.db
      .select()
      .from(human)
      .where(eq(human.principalId, c.req.param('id')))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return c.json(
        {
          title: 'Not Found',
          message: 'no human with this id',
          code: 'ERR-P01-S01-0404',
          method: c.req.method,
          instance: c.req.path,
          request_url: c.req.url,
          timestamp: new Date().toISOString(),
        },
        404,
      )
    }
    return c.json({
      id: row.principalId,
      email: row.email,
      display_name: row.displayName,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })
  })

  // ── Admin audit log (read-only) ───────────────────────
  // Newest first; optional exact-match filters on actor / action / target.
  .get('/v1/admin/audit-log', async (c) => {
    const { page, limit, offset } = paginate(c)
    const db = c.var.db
    const conds = []
    const actor = c.req.query('actor')
    const action = c.req.query('action')
    const target = c.req.query('target')
    if (actor) conds.push(eq(auditLog.actorPrincipalId, actor))
    if (action) conds.push(eq(auditLog.action, action))
    if (target) conds.push(eq(auditLog.targetId, target))
    const where = conds.length ? and(...conds) : undefined
    const totalRow = await db
      .select({ n: sql<number>`count(*)`.as('n') })
      .from(auditLog)
      .where(where)
    const total = Number(totalRow[0]?.n ?? 0)
    const rows = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset)
    return c.json({
      items: rows.map((r) => ({
        id: r.auditLogId,
        actor: r.actorPrincipalId,
        action: r.action,
        target: r.targetId,
        outcome: r.outcome,
        payload: r.payload,
        created_at: r.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        has_next_page: offset + rows.length < total,
      },
    })
  })

  // ── Admin agents list / get / force-revoke ────────────
  .get('/v1/admin/agents', async (c) => {
    const { page, limit, offset } = paginate(c)
    const db = c.var.db
    const totalRow = await db
      .select({ n: sql<number>`count(*)`.as('n') })
      .from(agent)
    const total = Number(totalRow[0]?.n ?? 0)
    const rows = await db
      .select()
      .from(agent)
      .orderBy(desc(agent.createdAt))
      .limit(limit)
      .offset(offset)
    return c.json({
      items: rows.map((r) => ({
        id: r.principalId,
        slug: r.slug,
        display_name: r.displayName,
        status: r.status,
        owner_human_principal_id: r.ownerHumanPrincipalId,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        has_next_page: offset + rows.length < total,
      },
    })
  })
  .get('/v1/admin/agents/:id', async (c) => {
    const rows = await c.var.db
      .select()
      .from(agent)
      .where(eq(agent.principalId, c.req.param('id')))
      .limit(1)
    const row = rows[0]
    if (!row) {
      return c.json(
        {
          title: 'Not Found',
          message: 'no agent with this id',
          code: 'ERR-P01-S01-0404',
          method: c.req.method,
          instance: c.req.path,
          request_url: c.req.url,
          timestamp: new Date().toISOString(),
        },
        404,
      )
    }
    return c.json({
      id: row.principalId,
      slug: row.slug,
      display_name: row.displayName,
      status: row.status,
      owner_human_principal_id: row.ownerHumanPrincipalId,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    })
  })
  .delete('/v1/admin/agents/:id', async (c) => {
    await c.var.db
      .update(agent)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(agent.principalId, c.req.param('id')))
    return c.body(null, 204)
  })

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
