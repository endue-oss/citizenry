import { Hono, type Context } from 'hono'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { VAULT_ERR } from '@citizenry/spec/error-codes/vault'
import type { Schema } from '../db/schema'
import {
  createVaultService,
  VaultError,
  VAULT_DATA_MAX_BYTES,
  VAULT_PAGE_LIMIT_DEFAULT,
  VAULT_PAGE_LIMIT_MAX,
  type VaultService,
} from '../service/vault'

// `agentJwtPayload` is set by the apps/api auth middleware after verifying
// the caller's self-signed agent JWT; `sub` is the owning agent id.
// `vault` lets a parent app (or tests) inject a service backed by a fake
// repo without spinning up a real D1; defaults to a drizzle-backed
// service over `c.var.db`.
type Vars = {
  db: DrizzleD1Database<Schema>
  agentJwtPayload?: { sub: string }
  vault?: VaultService
}

type Env = { Variables: Vars }

const errEnvelope = (
  c: Context<Env>,
  status: 400 | 401 | 404 | 413,
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

function svc(c: Context<Env>): VaultService {
  return c.var.vault ?? createVaultService({ db: c.var.db })
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

const byteLength = (s: string): number => new TextEncoder().encode(s).byteLength

/** Parse + clamp `page` and `limit` query params. Bad values fall back to defaults. */
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

export const vaultRouter = new Hono<Env>()
  .get('/entries', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', VAULT_ERR.unauthorized, 'agent jwt required')
    }
    const page = parsePage(c)
    const result = await svc(c).list(owner, page)
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
  .get('/entries/:id', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', VAULT_ERR.unauthorized, 'agent jwt required')
    }
    try {
      const entry = await svc(c).get(owner, c.req.param('id'))
      return c.json(entry)
    } catch (err) {
      if (err instanceof VaultError && err.code === 'not_found') {
        return errEnvelope(c, 404, 'Not Found', VAULT_ERR.not_found, 'entry not found')
      }
      throw err
    }
  })
  .post('/entries', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', VAULT_ERR.unauthorized, 'agent jwt required')
    }
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return errEnvelope(c, 400, 'Bad Request', VAULT_ERR.bad_request, 'body must be valid JSON')
    }
    if (!isNonEmptyString(body.data)) {
      return errEnvelope(
        c,
        400,
        'Bad Request',
        VAULT_ERR.invalid_body,
        'data is required (a non-empty RFC 7516 JWE string)',
      )
    }
    if (byteLength(body.data) > VAULT_DATA_MAX_BYTES) {
      return errEnvelope(
        c,
        413,
        'Payload Too Large',
        VAULT_ERR.payload_too_large,
        `data exceeds ${VAULT_DATA_MAX_BYTES} bytes`,
      )
    }
    const entry = await svc(c).create({ ownerId: owner, data: body.data })
    return c.json(entry, 201)
  })
  .delete('/entries/:id', async (c) => {
    const owner = ownerOf(c)
    if (!owner) {
      return errEnvelope(c, 401, 'Unauthorized', VAULT_ERR.unauthorized, 'agent jwt required')
    }
    try {
      await svc(c).delete(owner, c.req.param('id'))
      return c.body(null, 204)
    } catch (err) {
      if (err instanceof VaultError && err.code === 'not_found') {
        return errEnvelope(c, 404, 'Not Found', VAULT_ERR.not_found, 'entry not found')
      }
      throw err
    }
  })
