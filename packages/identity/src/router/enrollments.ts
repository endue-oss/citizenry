// Public enrollment surface — `Authorization: Bearer chk_…` (human
// API-Key). The caller's owner is resolved by the apiKeyAuth
// middleware in apps/api before this router runs. The X-Service-Key
// branch is gone — operator-driven enrollment issuance moved here,
// authenticated by the issuing human's own API-Key.
//
//   POST   /v1/enrollments         issue a fresh enrollment (eret_)
//   DELETE /v1/enrollments/:id     revoke (idempotent; owner must match)

import { Hono, type Context } from 'hono'
import type { Db } from '../db'
import {
  createEnrollmentService,
  EnrollmentError,
} from '../service/enrollment'

export type EnrollmentRouterVars = {
  db: Db
  pepper: Uint8Array
  mintEnrollmentId: () => string
  mintEnrollmentToken: () => string
  /** Set by apiKeyAuth middleware. */
  actor?: { humanPrincipalId: string; apiKeyId: string }
}

type Env = { Variables: EnrollmentRouterVars }

function svc(c: Context<Env>) {
  return createEnrollmentService({
    db: c.var.db,
    pepper: c.var.pepper,
    mintEnrollmentId: c.var.mintEnrollmentId,
    mintToken: c.var.mintEnrollmentToken,
  })
}

function err(
  c: Context<Env>,
  status: 400 | 401 | 403 | 404 | 500,
  code: string,
  title: string,
  message: string,
) {
  return c.json(
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
}

const TENANT_DEFAULT = 'public'

export const enrollmentsRouter = new Hono<Env>()
  .post('/v1/enrollments', async (c) => {
    if (!c.var.actor) {
      return err(c, 401, 'ERR-P01-S01-1040', 'Unauthorized', 'api-key required')
    }
    let body: {
      tenant?: string
      uses?: number
      ttl_secs?: number
      allow_keygen?: boolean
      metadata?: Record<string, unknown>
    } = {}
    try {
      body = (await c.req.json()) as typeof body
    } catch {
      return err(c, 400, 'ERR-P01-S01-0400', 'Bad Request', 'request body must be valid JSON')
    }
    const uses = body.uses ?? 1
    const ttlSecs = body.ttl_secs ?? 600
    if (!Number.isInteger(uses) || uses < 1 || uses > 100) {
      return err(c, 400, 'ERR-P01-S01-0400', 'Bad Request', 'uses must be 1..100')
    }
    if (!Number.isInteger(ttlSecs) || ttlSecs < 60 || ttlSecs > 86400) {
      return err(c, 400, 'ERR-P01-S01-0400', 'Bad Request', 'ttl_secs must be 60..86400')
    }

    const issued = await svc(c).create({
      ownerHumanPrincipalId: c.var.actor.humanPrincipalId,
      tenantId: body.tenant ?? TENANT_DEFAULT,
      usesTotal: uses,
      ttlSecs,
      allowKeygen: body.allow_keygen,
      metadata: body.metadata,
    })

    return c.json(
      {
        id: issued.id,
        token: issued.token,
        tenant: issued.tenantId,
        uses_total: issued.usesTotal,
        uses_left: issued.usesLeft,
        allow_keygen: issued.allowKeygen,
        expires_at: issued.expiresAt.toISOString(),
        owner_human_principal_id: issued.ownerHumanPrincipalId,
        metadata: issued.metadata,
        created_at: issued.createdAt.toISOString(),
      },
      201,
    )
  })

  .delete('/v1/enrollments/:id', async (c) => {
    if (!c.var.actor) {
      return err(c, 401, 'ERR-P01-S01-1040', 'Unauthorized', 'api-key required')
    }
    try {
      await svc(c).revoke(c.req.param('id'), c.var.actor.humanPrincipalId)
      return c.body(null, 204)
    } catch (e) {
      if (e instanceof EnrollmentError) {
        if (e.code === 'enrollment_not_found') {
          return err(c, 404, 'ERR-P01-S01-0404', 'Not Found', e.message)
        }
        if (e.code === 'enrollment_owner_mismatch') {
          return err(c, 403, 'ERR-P01-S01-0403', 'Forbidden', e.message)
        }
      }
      throw e
    }
  })
