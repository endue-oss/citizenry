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
import type { Db } from '../db'
import { createHumanService, HumanError, type Notifier } from '../service/human'

const VERIFICATION_TTL_MINUTES = 30

export type HumanRouterVars = {
  db: Db
  notifier: Notifier
  pepper: Uint8Array
  mintHumanId: () => string
  mintVerificationId: () => string
}

type Env = { Variables: HumanRouterVars }

const STATUS_BY_CODE: Record<string, number> = {
  mail_invalid: 400,
  mail_already_active: 409,
  mail_already_pending: 409,
  human_not_found: 404,
  human_already_verified: 409,
  verification_expired: 410,
  verification_code_invalid: 401,
  resend_too_soon: 429,
}

const ERR_CODE_BY_CODE: Record<string, string> = {
  mail_invalid: 'ERR-P01-S01-0400',
  mail_already_active: 'ERR-P01-S01-3100',
  mail_already_pending: 'ERR-P01-S01-3101',
  human_not_found: 'ERR-P01-S01-0404',
  human_already_verified: 'ERR-P01-S01-3102',
  verification_expired: 'ERR-P01-S01-7200',
  verification_code_invalid: 'ERR-P01-S01-1100',
  resend_too_soon: 'ERR-P01-S01-7201',
}

const TITLE_BY_CODE: Record<string, string> = {
  mail_invalid: 'Bad Request',
  mail_already_active: 'Conflict',
  mail_already_pending: 'Conflict',
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
  })
}

export const humansRouter = new Hono<Env>()
  // ── 1: start ───────────────────────────────────────────
  .post('/v1/humans', async (c) => {
    let body: { mail?: string; display_name?: string }
    try {
      body = (await c.req.json()) as { mail?: string; display_name?: string }
    } catch {
      return envelope(c, new HumanError('mail_invalid', 'request body must be valid JSON'))
    }
    if (typeof body.mail !== 'string') {
      return envelope(c, new HumanError('mail_invalid', 'mail is required'))
    }

    try {
      const result = await service(c).start({
        mail: body.mail,
        displayName: body.display_name,
      })

      // Fire-and-await notify so the response reflects delivery
      // status. Failures here do not roll back the row — the human
      // can request a resend.
      const notifyResult = await c.var.notifier.send({
        template: 'human_verification',
        to: [{ mail: result.human.mail }],
        context: {
          code: result.code,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
        },
      })

      return c.json(
        {
          id: result.human.principalId,
          mail: result.human.mail,
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
        mail: updated.mail,
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
        to: [{ mail: humanRow.mail }],
        context: {
          code: result.code,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
        },
      })

      return c.json({
        id,
        mail: humanRow.mail,
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
