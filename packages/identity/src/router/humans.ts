// Humans surface (RFC-0004).
//
//   POST /v1/humans          fresh-email registration → 202
//   POST /v1/humans/rotate   re-mail code for any existing row → 202
//   POST /v1/humans/verify   submit { email, code } → 201 { human_id, api_key }
//
// Every route is unauthenticated — the email round-trip is the
// credential. Rate-limited per (email, IP) with 2/min + 15/day caps;
// failures collapse to a single 401 on /verify to prevent enumeration.
//
// The first call mints the human's API-Key; subsequent /verify calls
// (after /rotate) atomically revoke the previous active key and mint
// a new one. The "one active API-Key per human" invariant is enforced
// by a partial unique index — see migrations/0012.

import { Hono, type Context } from 'hono'
import type { ConfigReader } from '@citizenry/config'
import type { Db } from '../db'
import {
  createHumanService,
  HumanError,
  type Notifier,
} from '../service/human'
import {
  createApiKeyService,
  ApiKeyError,
} from '../service/api_key'
import {
  createRateLimitService,
  type RateLimitBucket,
  type RateLimitScope,
  type RateLimitService,
} from '../service/rate_limit'

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
}

type Env = { Variables: HumanRouterVars }

const STATUS_BY_CODE: Record<string, 400 | 401 | 409 | 422 | 500> = {
  email_invalid: 400,
  email_domain_not_allowed: 422,
  email_already_in_use: 409,
  invalid_credentials: 401,
}

const ERR_CODE_BY_CODE: Record<string, string> = {
  email_invalid: 'ERR-P01-S01-0400',
  email_domain_not_allowed: 'ERR-P01-S01-2004',
  email_already_in_use: 'ERR-P01-S01-3100',
  invalid_credentials: 'ERR-P01-S01-1100',
}

const TITLE_BY_CODE: Record<string, string> = {
  email_invalid: 'Bad Request',
  email_domain_not_allowed: 'Unprocessable',
  email_already_in_use: 'Conflict',
  invalid_credentials: 'Unauthorized',
}

function envelope(c: Context<Env>, err: HumanError) {
  return c.json(
    {
      title: TITLE_BY_CODE[err.code] ?? 'Internal Server Error',
      message: err.message,
      detail: err.detail,
      code: ERR_CODE_BY_CODE[err.code] ?? 'ERR-P01-S01-0500',
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    STATUS_BY_CODE[err.code] ?? 500,
  )
}

function svc(c: Context<Env>) {
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

function rateLimitSvc(c: Context<Env>): RateLimitService {
  return createRateLimitService({ db: c.var.db })
}

// CF-Connecting-IP is injected by Cloudflare on every request; the
// header always wins because `x-forwarded-for` from the public edge
// is untrusted (clients can spoof). Local dev / tests fall back to
// the Hono request's runtime info.
function clientIp(c: Context<Env>): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-real-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

async function enforceRateLimit(
  c: Context<Env>,
  scope: RateLimitScope,
  email: string,
): Promise<Response | null> {
  const rl = rateLimitSvc(c)
  const buckets: RateLimitBucket[] = [
    { kind: 'email', value: email },
    { kind: 'ip', value: clientIp(c) },
  ]
  for (const bucket of buckets) {
    const decision = await rl.check(bucket, scope)
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSecs))
      return c.json(
        {
          title: 'Too Many Requests',
          message: `rate limit exceeded (${bucket.kind} / ${decision.reason})`,
          code: 'ERR-P01-S01-0429',
          method: c.req.method,
          instance: c.req.path,
          request_url: c.req.url,
          timestamp: new Date().toISOString(),
        },
        429,
      )
    }
  }
  for (const bucket of buckets) {
    await rl.recordHit(bucket, scope)
  }
  return null
}

const VERIFICATION_TTL_MS = VERIFICATION_TTL_MINUTES * 60 * 1000

function expiresAtIsoFromNow(): string {
  return new Date(Date.now() + VERIFICATION_TTL_MS).toISOString()
}

export const humansRouter = new Hono<Env>()
  // ── POST /v1/humans — fresh email only ─────────────────
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
    const email = body.email.trim().toLowerCase()
    const rl = await enforceRateLimit(c, 'humans.start', email)
    if (rl) return rl

    try {
      const result = await svc(c).startCreate({
        email,
        displayName: body.display_name,
      })
      await c.var.notifier.send({
        template: 'human_verification',
        to: [{ mail: result.human.email }],
        context: {
          code: result.code,
          expiresInMinutes: VERIFICATION_TTL_MINUTES,
        },
      })
      return c.json(
        { expires_at: result.verification.expiresAt.toISOString() },
        202,
      )
    } catch (err) {
      if (err instanceof HumanError) return envelope(c, err)
      throw err
    }
  })

  // ── POST /v1/humans/rotate — re-mail any existing row ──
  .post('/v1/humans/rotate', async (c) => {
    let body: { email?: string }
    try {
      body = (await c.req.json()) as { email?: string }
    } catch {
      return envelope(c, new HumanError('email_invalid', 'request body must be valid JSON'))
    }
    if (typeof body.email !== 'string') {
      return envelope(c, new HumanError('email_invalid', 'email is required'))
    }
    const email = body.email.trim().toLowerCase()
    const rl = await enforceRateLimit(c, 'humans.rotate', email)
    if (rl) return rl

    try {
      const result = await svc(c).startRotate({ email })
      if (result) {
        await c.var.notifier.send({
          template: 'human_verification',
          to: [{ mail: result.human.email }],
          context: {
            code: result.code,
            expiresInMinutes: VERIFICATION_TTL_MINUTES,
          },
        })
      }
      // Always-202, identical shape regardless of whether the email
      // matched an existing row — oracle-safe.
      return c.json(
        { expires_at: result?.verification.expiresAt.toISOString() ?? expiresAtIsoFromNow() },
        202,
      )
    } catch (err) {
      // Only invalid email / domain surfaces. Unknown email → silent
      // null inside the service, no error here.
      if (err instanceof HumanError) return envelope(c, err)
      throw err
    }
  })

  // ── POST /v1/humans/verify — submit { email, code } ────
  .post('/v1/humans/verify', async (c) => {
    let body: { email?: string; code?: string }
    try {
      body = (await c.req.json()) as { email?: string; code?: string }
    } catch {
      return envelope(c, new HumanError('invalid_credentials', 'verification failed'))
    }
    if (typeof body.email !== 'string' || typeof body.code !== 'string') {
      return envelope(c, new HumanError('invalid_credentials', 'verification failed'))
    }
    const email = body.email.trim().toLowerCase()
    const rl = await enforceRateLimit(c, 'humans.verify', email)
    if (rl) return rl

    try {
      const result = await svc(c).verify({ email, code: body.code })
      // Code accepted → mint the new API-Key, revoking any prior
      // active key for the owner in the same step.
      const issued = await apiKeySvc(c).issueReplacing({
        humanPrincipalId: result.human.principalId,
        displayName: 'primary',
        expiresAt: null,
      })
      return c.json(
        {
          human_id: result.human.principalId,
          api_key: issued.token,
          expires_at: issued.expiresAt ? issued.expiresAt.toISOString() : null,
        },
        201,
      )
    } catch (err) {
      if (err instanceof HumanError) return envelope(c, err)
      if (err instanceof ApiKeyError) {
        // Shouldn't happen if verify succeeded — degrade to 500 so
        // the cause is investigatable, not silently 401.
        return c.json(
          {
            title: 'Internal Server Error',
            message: `verify succeeded but api-key issue failed: ${err.message}`,
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
