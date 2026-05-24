// Privileged `/_internal/notify` route — called by other Workers via
// service binding to dispatch system-initiated email. See ADR-2026-0005.
//
// Auth: `X-Service-Key` header equal to env.SERVICE_KEY (same PSK that
// gates api `/_admin/*`). Constant-time comparison.
//
// Body shape:
//   {
//     template: 'human_verification' | ...,
//     to: [{ name?, mail }, ...],
//     context: { ... },               // template-specific
//     from?: { name?, mail }          // optional override
//   }
//
// Response: 202 with the audit row id and resolved status. The route
// always returns 202 once the row is persisted — the row's `status`
// carries the outcome (sent / failed / invalid_request). This keeps
// the contract uniform from the caller's perspective: "request was
// accepted; inspect mail_outbound_log for the result."

import { Hono, type Context } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import {
  processNotify,
  schema as mailSchema,
  type NotifyRequest,
} from '@citizenry/mail'
import type { Bindings } from '../env'
import { configReader, type ConfigVars } from '../db'
import { buildSender } from '../outbound'
import { mintId } from '../ids'

type InternalVars = ConfigVars

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function unauthorized(c: Context, message: string) {
  return c.json(
    {
      title: 'Unauthorized',
      message,
      code: 'ERR-P01-S02-0401',
      method: c.req.method,
      instance: c.req.path,
      request_url: c.req.url,
      timestamp: new Date().toISOString(),
    },
    401,
  )
}

export const internalRouter = new Hono<{
  Bindings: Bindings
  Variables: InternalVars
}>()
  .use('*', async (c, next) => {
    const expected = c.env.SERVICE_KEY
    if (!expected || expected.length === 0) {
      return unauthorized(c, 'SERVICE_KEY is not configured on the mail Worker')
    }
    const presented = c.req.header('X-Service-Key') ?? ''
    if (!timingSafeEqual(presented, expected)) {
      return unauthorized(c, 'X-Service-Key missing or invalid')
    }
    await next()
  })
  .use('*', configReader)
  .post('/_internal/notify', async (c) => {
    let body: NotifyRequest
    try {
      body = (await c.req.json()) as NotifyRequest
    } catch {
      return c.json(
        {
          title: 'Bad Request',
          message: 'request body must be valid JSON',
          code: 'ERR-P01-S02-0400',
          method: c.req.method,
          instance: c.req.path,
          request_url: c.req.url,
          timestamp: new Date().toISOString(),
        },
        400,
      )
    }

    const sender = await buildSender(c.env, c.var.config)
    const db = drizzle(c.env.DB_MAIL, { schema: mailSchema })
    const caller = c.req.header('X-Caller') ?? null

    const result = await processNotify(
      {
        db,
        sender,
        defaultFrom: { mail: `noreply@${c.env.MAIL_DOMAIN}` },
        caller,
        mintLogId: () => mintId('OUTBOUND_LOG'),
      },
      body,
    )

    return c.json(
      {
        outbound_log_id: result.outboundLogId,
        status: result.status,
        provider_message_id: result.providerMessageId,
        sender_name: result.senderName,
        error_message: result.errorMessage,
      },
      202,
    )
  })
