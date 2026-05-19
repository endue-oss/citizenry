import { Hono } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'

type Vars = { db: DrizzleD1Database<Schema> }

export const adminVaultRouter = new Hono<{ Variables: Vars }>()
  .get('/v1/admin/vault/entries', (c) =>
    c.json({
      items: [],
      meta: { total: 0, page: 1, limit: 50, has_next_page: false },
    }),
  )
  .delete('/v1/admin/vault/entries/:id', (c) => c.body(null, 204))
