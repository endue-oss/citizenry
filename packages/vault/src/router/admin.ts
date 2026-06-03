import { Hono, type Context } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'
import {
  createVaultService,
  VAULT_PAGE_LIMIT_DEFAULT,
  VAULT_PAGE_LIMIT_MAX,
  type VaultService,
} from '../service/vault'

type Vars = {
  db: DrizzleD1Database<Schema>
  /** Injection hook for tests; defaults to a drizzle-backed service over `db`. */
  vault?: VaultService
}
type Env = { Variables: Vars }

const svc = (c: Context<Env>): VaultService =>
  c.var.vault ?? createVaultService({ db: c.var.db })

function parsePage(c: Context<Env>): { page: number; limit: number } {
  const rawPage = Number(c.req.query('page'))
  const rawLimit = Number(c.req.query('limit'))
  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, VAULT_PAGE_LIMIT_MAX)
      : VAULT_PAGE_LIMIT_DEFAULT
  return { page, limit }
}

// Mounted behind the X-Service-Key gate in apps/api. Operator surface:
// list across owners (optional owner_id filter) and idempotent delete.
export const adminVaultRouter = new Hono<Env>()
  .get('/v1/admin/vault/entries', async (c) => {
    const ownerId = c.req.query('owner_id') || undefined
    const page = parsePage(c)
    const result = await svc(c).adminList(page, ownerId)
    return c.json({
      items: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        has_next_page: result.page * result.limit < result.total,
      },
    })
  })
  .delete('/v1/admin/vault/entries/:id', async (c) => {
    await svc(c).adminDelete(c.req.param('id'))
    return c.body(null, 204)
  })
