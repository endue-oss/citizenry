// POST /v1/agent/register — Bearer chk_ (human API-Key) authenticated.
// The owner human comes from `c.var.actor`; the body carries either a
// public_key_jwk or `generate_keypair=true`.

import { Hono, type Context } from 'hono'
import type { Db } from '../db'
import {
  createRegisterService,
  RegisterError,
  type Ed25519Jwk,
} from '../service/register'

export type RegisterRouterVars = {
  db: Db
  mintAgentId: () => string
  mintKid: () => string
  /** `did:web:{issuer}` builder uses this host. */
  issuerHost: string
  /** Set by apiKeyAuth middleware. */
  actor?: { humanPrincipalId: string; apiKeyId: string }
}

type Env = { Variables: RegisterRouterVars }

function svc(c: Context<Env>) {
  return createRegisterService({
    db: c.var.db,
    mintAgentId: c.var.mintAgentId,
    mintKid: c.var.mintKid,
  })
}

const STATUS_BY_CODE: Record<string, 400 | 401 | 403 | 409 | 422 | 500> = {
  jwk_invalid: 422,
  jwk_or_keygen_required: 400,
  slug_invalid: 422,
  slug_taken: 409,
  tenant_invalid: 422,
}

const ERR_CODE: Record<string, string> = {
  jwk_invalid: 'ERR-P01-S01-2001',
  jwk_or_keygen_required: 'ERR-P01-S01-0400',
  slug_invalid: 'ERR-P01-S01-2002',
  slug_taken: 'ERR-P01-S01-3110',
  tenant_invalid: 'ERR-P01-S01-2003',
}

const TITLE: Record<string, string> = {
  jwk_invalid: 'Unprocessable',
  jwk_or_keygen_required: 'Bad Request',
  slug_invalid: 'Unprocessable',
  slug_taken: 'Conflict',
  tenant_invalid: 'Unprocessable',
}

function envelope(c: Context<Env>, err: RegisterError) {
  return c.json(
    {
      title: TITLE[err.code] ?? 'Internal Server Error',
      message: err.message,
      detail: err.detail,
      code: ERR_CODE[err.code] ?? 'ERR-P01-S01-0500',
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    STATUS_BY_CODE[err.code] ?? 500,
  )
}

export const registerRouter = new Hono<Env>().post('/v1/agent/register', async (c) => {
  if (!c.var.actor) {
    return c.json(
      {
        title: 'Unauthorized',
        message: 'api-key required',
        code: 'ERR-P01-S01-1040',
        method: c.req.method,
        instance: c.req.path,
        request_url: c.req.url,
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  let body: {
    slug?: string
    display_name?: string
    public_key_jwk?: Ed25519Jwk
    generate_keypair?: boolean
    tenant?: string
    metadata?: Record<string, unknown>
  }
  try {
    body = (await c.req.json()) as typeof body
  } catch {
    return c.json(
      {
        title: 'Bad Request',
        message: 'request body must be valid JSON',
        code: 'ERR-P01-S01-0400',
        method: c.req.method,
        instance: c.req.path,
        request_url: c.req.url,
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }
  if (typeof body.slug !== 'string') {
    return c.json(
      {
        title: 'Bad Request',
        message: 'slug is required',
        code: 'ERR-P01-S01-0400',
        method: c.req.method,
        instance: c.req.path,
        request_url: c.req.url,
        timestamp: new Date().toISOString(),
      },
      400,
    )
  }

  try {
    const result = await svc(c).register({
      ownerHumanPrincipalId: c.var.actor.humanPrincipalId,
      slug: body.slug,
      displayName: body.display_name,
      publicKeyJwk: body.public_key_jwk,
      generateKeypair: body.generate_keypair,
      tenantSlug: body.tenant,
      metadata: body.metadata,
    })

    return c.json(
      {
        id: result.agent.principalId,
        slug: result.agent.slug,
        display_name: result.agent.displayName ?? undefined,
        did: `did:web:${c.var.issuerHost}:agent:${result.agent.principalId}`,
        kid: result.agentKey.kid,
        tenant: result.tenantSlug,
        owner_human_principal_id: result.agent.ownerHumanPrincipalId,
        private_key_jwk: result.privateKeyJwk,
        metadata: body.metadata,
        created_at: result.agent.createdAt.toISOString(),
      },
      201,
    )
  } catch (err) {
    if (err instanceof RegisterError) return envelope(c, err)
    throw err
  }
})
