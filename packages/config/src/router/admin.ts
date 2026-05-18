// Admin-only router for config — mounted by `apps/api` under `/_admin`.
//
// External surface (after admin-api's proxy):
//   GET    /api/v1/admin/config            → list (optional `?prefix=`)
//   GET    /api/v1/admin/config/:key       → one entry, 404 if missing
//   PUT    /api/v1/admin/config/:key       → upsert
//   DELETE /api/v1/admin/config/:key       → idempotent delete
//
// Auth is handled by the parent `apps/api` admin middleware (the same
// X-Service-Key PSK that gates every other `/_admin/*` route).

import { Hono } from 'hono'
import type { Db } from '../db'
import { createConfigReader } from '../service/reader'
import { createConfigWriter } from '../service/writer'

type Vars = { db: Db }

export const adminConfigRouter = new Hono<{ Variables: Vars }>()
  // ── List ──────────────────────────────────────────────
  .get('/api/v1/admin/config', async (c) => {
    const reader = createConfigReader(c.var.db)
    const prefix = c.req.query('prefix')
    const items = await reader.list(prefix)
    return c.json({
      items: items.map((e) => ({
        key: e.key,
        value: e.value,
        updated_at: e.updatedAt.toISOString(),
        updated_by: e.updatedBy,
      })),
    })
  })

  // ── Read one ──────────────────────────────────────────
  .get('/api/v1/admin/config/:key', async (c) => {
    const reader = createConfigReader(c.var.db)
    const entry = await reader.get(c.req.param('key'))
    if (!entry) {
      return c.json({ error: 'config_not_found', key: c.req.param('key') }, 404)
    }
    return c.json({
      key: entry.key,
      value: entry.value,
      updated_at: entry.updatedAt.toISOString(),
      updated_by: entry.updatedBy,
    })
  })

  // ── Upsert ────────────────────────────────────────────
  .put('/api/v1/admin/config/:key', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
    if (typeof body !== 'object' || body === null || !('value' in body)) {
      return c.json({ error: 'missing_value' }, 400)
    }
    const writer = createConfigWriter(c.var.db)
    const updatedBy =
      'updated_by' in body && typeof body.updated_by === 'string'
        ? body.updated_by
        : null
    const entry = await writer.set({
      key: c.req.param('key'),
      value: (body as { value: unknown }).value,
      updatedBy,
    })
    return c.json(
      {
        key: entry.key,
        value: entry.value,
        updated_at: entry.updatedAt.toISOString(),
        updated_by: entry.updatedBy,
      },
      200,
    )
  })

  // ── Delete (idempotent) ───────────────────────────────
  .delete('/api/v1/admin/config/:key', async (c) => {
    const writer = createConfigWriter(c.var.db)
    await writer.delete(c.req.param('key'))
    return c.body(null, 204)
  })
