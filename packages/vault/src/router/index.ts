import { Hono } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'

type Vars = { db: DrizzleD1Database<Schema> }

export const vaultRouter = new Hono<{ Variables: Vars }>()
  .get('/entries', (c) => c.json({ todo: 'list entries' }))
  .get('/entries/:id', (c) => c.json({ todo: 'get entry' }))
  .post('/entries', (c) => c.json({ todo: 'create entry' }, 201))
