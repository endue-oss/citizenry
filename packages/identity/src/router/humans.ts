// Public, unauth human-registration routes.
//
//   POST /v1/humans                  → start verification flow
//   POST /v1/humans/:id/verify       → submit code
//   POST /v1/humans/:id/verify/resend → request another code
//
// All BaseError-shaped (packages/spec/common/errors.tsp BaseError). The
// HumanError catalog maps to specific HTTP status + ERR-P01-S01-{NNNN}
// codes. The api Worker injects `db`, `notifier`, `pepper`, and the
// minters via middleware before this router runs.

import { Hono, type Context } from 'hono'
import type { ConfigReader } from '@citizenry/config'
import type { Db } from '../db'
import { createHumanService, HumanError, type Notifier } from '../service/human'

const VERIFICATION_TTL_MINUTES = 30

export type HumanRouterVars = {
  db: Db
  notifier: Notifier
  pepper: Uint8Array
  mintHumanId: () => string
  mintVerificationId: () => string
  config: ConfigReader
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

  // ── 3: verify ──────────────────────────────────────────
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
      return c.json({
        id: updated.principalId,
        email: updated.email,
        status: updated.status,
        verified_at: updated.updatedAt.toISOString(),
      })
    } catch (err) {
      if (err instanceof HumanError) return envelope(c, err)
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
