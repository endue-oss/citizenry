import { Hono } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'

type Vars = { db: DrizzleD1Database<Schema> }

export const adminVaultRouter = new Hono<{ Variables: Vars }>()
  .get('/entries', (c) => c.json({ todo: 'admin list all entries' }))
  .delete('/entries/:id', (c) => c.json({ todo: 'admin delete entry' }))
