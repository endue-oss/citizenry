import { Hono, type Context } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { Schema } from '../db/schema'
import { createVaultService, VaultError } from '../service/vault'

// `agentJwtPayload` is set by the apps/api auth middleware after verifying
// the caller's self-signed agent JWT; `sub` is the owning agent id.
type Vars = {
  db: DrizzleD1Database<Schema>
  agentJwtPayload?: { sub: string }
}

type Env = { Variables: Vars }

const errEnvelope = (
  c: Context<Env>,
  status: 400 | 401 | 404,
  title: string,
  code: string,
  message: string,
) =>
  c.json(
    {
      title,
      message,
      code,
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    status,
  )

const ownerOf = (c: Context<Env>): string | null => c.var.agentJwtPayload?.sub ?? null

function svc(c: Context<Env>) {
  return createVaultService({ db: c.var.db })
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

export const vaultRouter = new Hono<Env>()
  .get('/entries', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', 'ERR-P02-S01-0401', 'agent jwt required')
    }
    const items = await svc(c).list(owner)
    return c.json({
      items,
      meta: { total: items.length, page: 1, limit: items.length, has_next_page: false },
    })
  })
  .get('/entries/:id', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', 'ERR-P02-S01-0401', 'agent jwt required')
    }
    try {
      const entry = await svc(c).get(owner, c.req.param('id'))
      return c.json(entry)
    } catch (err) {
      if (err instanceof VaultError && err.code === 'not_found') {
        return errEnvelope(c, 404, 'Not Found', 'ERR-P02-S01-0404', 'entry not found')
      }
      throw err
    }
  })
  .post('/entries', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', 'ERR-P02-S01-0401', 'agent jwt required')
    }
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return errEnvelope(c, 400, 'Bad Request', 'ERR-P02-S01-0400', 'body must be valid JSON')
    }
    if (!isNonEmptyString(body.data)) {
      return errEnvelope(
        c,
        400,
        'Bad Request',
        'ERR-P02-S01-0400',
        'data is required (an RFC 7516 JWE string)',
      )
    }
    const entry = await svc(c).create({ ownerId: owner, data: body.data })
    return c.json(entry, 201)
  })
