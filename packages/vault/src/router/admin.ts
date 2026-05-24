import { Hono } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'
import { createVaultService } from '../service/vault'

type Vars = { db: DrizzleD1Database<Schema> }

// Mounted behind the X-Service-Key gate in apps/api. Operator surface:
// list across owners (optional owner_id filter) and idempotent delete.
export const adminVaultRouter = new Hono<{ Variables: Vars }>()
  .get('/v1/admin/vault/entries', async (c) => {
    const ownerId = c.req.query('owner_id') || undefined
    const items = await createVaultService({ db: c.var.db }).adminList(ownerId)
    return c.json({
      items,
      meta: { total: items.length, page: 1, limit: items.length, has_next_page: false },
    })
  })
  .delete('/v1/admin/vault/entries/:id', async (c) => {
    await createVaultService({ db: c.var.db }).adminDelete(c.req.param('id'))
    return c.body(null, 204)
  })
