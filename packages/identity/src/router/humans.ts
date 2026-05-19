// Human registration + API-Key surface.
//
//   POST /v1/humans                       → start verification flow (public)
//   GET  /v1/humans?email=…               → public lookup by email
//   POST /v1/humans/:id/verify            → submit code, receive first API-Key
//   POST /v1/humans/:id/verify/resend     → request another code
//   POST /v1/humans/:id/api-key/issue     → Bearer chk_ → mint another API-Key
//   POST /v1/humans/:id/api-key/revoke    → Bearer chk_ → revoke a key
//
// All BaseError-shaped (packages/spec/common/errors.tsp BaseError). The
// HumanError catalog maps to specific HTTP status + ERR-P01-S01-{NNNN}
// codes. The api Worker injects `db`, `notifier`, `pepper`, and the
// minters via middleware before this router runs.

import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import type { ConfigReader } from '@citizenry/config'
import type { Db } from '../db'
import { human } from '../db/schema'
import { createHumanService, HumanError, type Notifier } from '../service/human'
import {
  createApiKeyService,
  ApiKeyError,
  type IssuedApiKey,
} from '../service/api_key'

const VERIFICATION_TTL_MINUTES = 30

export type HumanRouterVars = {
  db: Db
  notifier: Notifier
  pepper: Uint8Array
  mintHumanId: () => string
  mintVerificationId: () => string
  mintApiKeyId: () => string
  mintApiKeyToken: () => string
  config: ConfigReader
  /** Set by `apiKeyAuth` middleware on /api-key/* subroutes. */
  actor?: { humanPrincipalId: string; apiKeyId: string }
}

type Env = { Variables: HumanRouterVars }

const STATUS_BY_CODE: Record<string, number> = {
  email_invalid: 400,
  email_domain_not_allowed: 400,
  email_already_active: 409,
  email_already_pending: 409,
  human_not_found: 404,
  human_already_verified: 409,
  verification_expired: 410,
  verification_code_invalid: 401,
  resend_too_soon: 429,
}

const ERR_CODE_BY_CODE: Record<string, string> = {
  email_invalid: 'ERR-P01-S01-0400',
  email_domain_not_allowed: 'ERR-P01-S01-2004',
  email_already_active: 'ERR-P01-S01-3100',
  email_already_pending: 'ERR-P01-S01-3101',
  human_not_found: 'ERR-P01-S01-0404',
  human_already_verified: 'ERR-P01-S01-3102',
  verification_expired: 'ERR-P01-S01-7200',
  verification_code_invalid: 'ERR-P01-S01-1100',
  resend_too_soon: 'ERR-P01-S01-7201',
}

const TITLE_BY_CODE: Record<string, string> = {
  email_invalid: 'Bad Request',
  email_domain_not_allowed: 'Bad Request',
  email_already_active: 'Conflict',
  email_already_pending: 'Conflict',
  human_not_found: 'Not Found',
  human_already_verified: 'Conflict',
  verification_expired: 'Gone',
  verification_code_invalid: 'Unauthorized',
  resend_too_soon: 'Too Many Requests',
}

function envelope(c: Context, err: HumanError) {
  const status = STATUS_BY_CODE[err.code] ?? 500
  const body = {
    title: TITLE_BY_CODE[err.code] ?? 'Internal Server Error',
    message: err.message,
    detail: err.detail,
    code: ERR_CODE_BY_CODE[err.code] ?? 'ERR-P01-S01-0500',
    method: c.req.method,
    instance: c.req.path,
    request_url: c.req.url,
    timestamp: new Date().toISOString(),
  }
  return c.json(body, status as 400 | 401 | 404 | 409 | 410 | 429 | 500)
}

function service(c: Context<Env>) {
  return createHumanService({
    db: c.var.db,
    pepper: c.var.pepper,
    mintHumanId: c.var.mintHumanId,
    mintVerificationId: c.var.mintVerificationId,
    config: c.var.config,
  })
}

function apiKeySvc(c: Context<Env>) {
  return createApiKeyService({
    db: c.var.db,
    pepper: c.var.pepper,
    mintApiKeyId: c.var.mintApiKeyId,
    mintToken: c.var.mintApiKeyToken,
  })
}

async function issueAndDeliverApiKey(
  c: Context<Env>,
  humanPrincipalId: string,
  recipientEmail: string,
  displayName: string | null = null,
  expiresAt: Date | null = null,
): Promise<{ issued: IssuedApiKey; notify: { outbound_log_id: string; status: string } }> {
  const issued = await apiKeySvc(c).issue({
    humanPrincipalId,
    displayName,
    expiresAt,
  })
  const notify = await c.var.notifier.send({
    template: 'human_api_key',
    to: [{ mail: recipientEmail }],
    context: {
      token: issued.token,
      displayName: issued.displayName,
      expiresAt: issued.expiresAt ? issued.expiresAt.toISOString() : null,
    },
  })
  return { issued, notify: { outbound_log_id: notify.outbound_log_id, status: notify.status } }
}

const FORBIDDEN_OWNER_MISMATCH = {
  code: 'ERR-P01-S01-0403',
  title: 'Forbidden',
  message: 'api-key owner does not match path id',
}

export const humansRouter = new Hono<Env>()
  // ── 1: start ───────────────────────────────────────────
  .post('/v1/humans', async (c) => {
    let body: { email?: string; display_name?: string }
    try {
      body = (await c.req.json()) as { email?: string; display_name?: string }
    } catch {
      return envelope(c, new HumanError('email_invalid', 'request body must be valid JSON'))
    }
    if (typeof body.email !== 'string') {
      return envelope(c, new HumanError('email_invalid', 'email is required'))
    }

    try {
      const result = await service(c).start({
        email: body.email,
        displayName: body.display_name,
      })

      // Fire-and-await notify so the response reflects delivery
      // status. Failures here do not roll back the row — the human
      // can request a resend.
      const notifyResult = await c.var.notifier.send({
        template: 'human_verification',
        to: [{ mail: result.human.email }],
        context: {
          code: result.code,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
        },
      })

      return c.json(
        {
          id: result.human.principalId,
          email: result.human.email,
          status: result.human.status,
          expires_at: result.verification.expiresAt.toISOString(),
          can_resend_at: result.verification.nextResendAt.toISOString(),
          notify_outbound_log_id: notifyResult.outbound_log_id,
          notify_status: notifyResult.status,
        },
        202,
      )
    } catch (err) {
      if (err instanceof HumanError) return envelope(c, err)
      throw err
    }
  })

  // ── GET ?email=… : public lookup ───────────────────────
  .get('/v1/humans', async (c) => {
    const raw = c.req.query('email')
    if (typeof raw !== 'string' || raw.length === 0) {
      return envelope(c, new HumanError('email_invalid', 'email query parameter is required'))
    }
    const email = raw.trim().toLowerCase()
    const rows = await c.var.db
      .select({ id: human.principalId, status: human.status })
      .from(human)
      .where(eq(human.email, email))
      .limit(1)
    const row = rows[0]
    if (!row) return envelope(c, new HumanError('human_not_found', 'no human for this email'))
    return c.json({ id: row.id, status: row.status })
  })

  // ── 3: verify (and emit the first API-Key) ─────────────
  .post('/v1/humans/:id/verify', async (c) => {
    let body: { code?: string }
    try {
      body = (await c.req.json()) as { code?: string }
    } catch {
      return envelope(
        c,
        new HumanError('verification_code_invalid', 'request body must be valid JSON'),
      )
    }
    if (typeof body.code !== 'string') {
      return envelope(c, new HumanError('verification_code_invalid', 'code is required'))
    }
    try {
      const updated = await service(c).verify(c.req.param('id'), body.code)

      // Bootstrap the first API-Key inline. Surfaced once in the
      // response and emailed in parallel so the human can recover it
      // out-of-band.
      const { issued, notify } = await issueAndDeliverApiKey(
        c,
        updated.principalId,
        updated.email,
        'initial',
        null,
      )

      return c.json({
        id: updated.principalId,
        email: updated.email,
        status: updated.status,
        verified_at: updated.updatedAt.toISOString(),
        api_key: {
          api_key_id: issued.apiKeyId,
          token: issued.token,
          display_name: issued.displayName ?? undefined,
          expires_at: issued.expiresAt ? issued.expiresAt.toISOString() : undefined,
          created_at: issued.createdAt.toISOString(),
          notify_outbound_log_id: notify.outbound_log_id,
          notify_status: notify.status,
        },
      })
    } catch (err) {
      if (err instanceof HumanError) return envelope(c, err)
      if (err instanceof ApiKeyError) {
        return c.json(
          {
            title: 'Internal Server Error',
            message: `verify succeeded but first api-key issue failed: ${err.message}`,
            code: 'ERR-P01-S01-0500',
            method: c.req.method,
            instance: c.req.path,
            request_url: c.req.url,
            timestamp: new Date().toISOString(),
          },
          500,
        )
      }
      throw err
    }
  })

  // ── 4: resend ──────────────────────────────────────────
  .post('/v1/humans/:id/verify/resend', async (c) => {
    try {
      const id = c.req.param('id')
      const humanRow = await service(c).findById(id)
      if (!humanRow) {
        return envelope(c, new HumanError('human_not_found', 'no human with this id'))
      }
      const result = await service(c).requestResend(id)
      const notifyResult = await c.var.notifier.send({
        template: 'human_verification',
        to: [{ mail: humanRow.email }],
        context: {
          code: result.code,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
        },
      })

      return c.json({
        id,
        email: humanRow.email,
        resend_count: result.verification.resendCount,
        can_resend_at: result.verification.nextResendAt.toISOString(),
        expires_at: result.verification.expiresAt.toISOString(),
        notify_outbound_log_id: notifyResult.outbound_log_id,
        notify_status: notifyResult.status,
      })
    } catch (err) {
      if (err instanceof HumanError) {
        if (err.code === 'resend_too_soon' && err.detail?.can_resend_at) {
          const next = new Date(String(err.detail.can_resend_at))
          c.header(
            'Retry-After',
            Math.max(1, Math.ceil((next.getTime() - Date.now()) / 1000)).toString(),
          )
        }
        return envelope(c, err)
      }
      throw err
    }
  })

  // ── 5: api-key/issue (Bearer chk_) ─────────────────────
  // The apiKeyAuth middleware (apps/api/src/middleware/auth.ts) is
  // mounted in front of this route; c.var.actor carries the resolved
  // owner principal id.
  .post('/v1/humans/:id/api-key/issue', async (c) => {
    const id = c.req.param('id')
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
    if (c.var.actor.humanPrincipalId !== id) {
      return c.json({ ...FORBIDDEN_OWNER_MISMATCH, method: c.req.method, instance: c.req.path, request_url: c.req.url, timestamp: new Date().toISOString() }, 403)
    }

    let body: { display_name?: string; expires_at?: string } = {}
    if (c.req.header('Content-Length')) {
      try {
        body = (await c.req.json()) as typeof body
      } catch {
        return envelope(c, new HumanError('email_invalid', 'request body must be valid JSON'))
      }
    }

    const humanRow = await service(c).findById(id)
    if (!humanRow) {
      return envelope(c, new HumanError('human_not_found', 'no human with this id'))
    }
    if (humanRow.status !== 'active') {
      return envelope(c, new HumanError('human_already_verified', 'human is not active'))
    }

    const expiresAt = body.expires_at ? new Date(body.expires_at) : null
    try {
      const { issued, notify } = await issueAndDeliverApiKey(
        c,
        id,
        humanRow.email,
        body.display_name ?? null,
        expiresAt,
      )
      return c.json(
        {
          api_key_id: issued.apiKeyId,
          token: issued.token,
          display_name: issued.displayName ?? undefined,
          expires_at: issued.expiresAt ? issued.expiresAt.toISOString() : undefined,
          created_at: issued.createdAt.toISOString(),
          notify_outbound_log_id: notify.outbound_log_id,
          notify_status: notify.status,
        },
        201,
      )
    } catch (err) {
      if (err instanceof ApiKeyError) {
        return c.json(
          {
            title: 'Internal Server Error',
            message: err.message,
            detail: err.detail,
            code: 'ERR-P01-S01-0500',
            method: c.req.method,
            instance: c.req.path,
            request_url: c.req.url,
            timestamp: new Date().toISOString(),
          },
          500,
        )
      }
      throw err
    }
  })

  // ── 6: api-key/revoke (Bearer chk_) ────────────────────
  .post('/v1/humans/:id/api-key/revoke', async (c) => {
    const id = c.req.param('id')
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
    if (c.var.actor.humanPrincipalId !== id) {
      return c.json({ ...FORBIDDEN_OWNER_MISMATCH, method: c.req.method, instance: c.req.path, request_url: c.req.url, timestamp: new Date().toISOString() }, 403)
    }

    let body: { api_key_id?: string }
    try {
      body = (await c.req.json()) as { api_key_id?: string }
    } catch {
      return envelope(c, new HumanError('email_invalid', 'request body must be valid JSON'))
    }
    if (typeof body.api_key_id !== 'string') {
      return envelope(c, new HumanError('email_invalid', 'api_key_id is required'))
    }

    try {
      await apiKeySvc(c).revoke(body.api_key_id, id)
      return c.body(null, 204)
    } catch (err) {
      if (err instanceof ApiKeyError) {
        if (err.code === 'api_key_not_found') {
          return c.json(
            {
              title: 'Not Found',
              message: err.message,
              code: 'ERR-P01-S01-0404',
              method: c.req.method,
              instance: c.req.path,
              request_url: c.req.url,
              timestamp: new Date().toISOString(),
            },
            404,
          )
        }
        return c.json(
          {
            title: 'Internal Server Error',
            message: err.message,
            code: 'ERR-P01-S01-0500',
            method: c.req.method,
            instance: c.req.path,
            request_url: c.req.url,
            timestamp: new Date().toISOString(),
          },
          500,
        )
      }
      throw err
    }
  })
