// HTTP router for the mail Worker. Pure surface — no Worker globals;
// apps/mail wires it into a Hono app with a Db middleware and a MailSender.
//
// Error envelope matches packages/spec/common/errors.tsp BaseError.
// MailError instances thrown by handlers are caught by app.onError and
// rendered as JSON. Routes do not return ad-hoc `{ error: '...' }` bodies.

import { Hono, type Context } from 'hono'
import { z } from 'zod'
import type { Db } from '../db'
import { MAIL, MailError } from '../errors'
import {
  getMail,
  listMails,
  listMailboxes,
  sendMail,
  ensureDefaultMailboxes,
  type IdMinter,
  type MailSender,
} from '../service'

export type MailRouterVars = {
  db: Db
  /** agent.principal_id resolved by Bearer auth in apps/mail. */
  accountId: string
  /** Mint a prefixed ULID. Provided by apps/mail (which owns the runtime). */
  mintId: IdMinter
  /** Outbound provider. Provided by apps/mail. */
  sender: MailSender
}

const addressSchema = z.object({
  name: z.string().max(255).optional(),
  mail: z.string().email(),
})

const sendBody = z.object({
  from: addressSchema.optional(),
  to: z.array(addressSchema).min(1).max(50),
  cc: z.array(addressSchema).max(50).optional(),
  bcc: z.array(addressSchema).max(50).optional(),
  replyTo: z.array(addressSchema).max(10).optional(),
  subject: z.string().min(1).max(998),
  text: z.string().optional(),
  html: z.string().optional(),
})

/** MailError → BaseError envelope (packages/spec/common/errors.tsp). */
const envelope = (c: Context, err: MailError) => ({
  title: err.title,
  message: err.message,
  detail: err.detail,
  code: err.code,
  method: c.req.method,
  instance: c.req.path,
  request_url: c.req.url,
  timestamp: new Date().toISOString(),
})

export const mailRouter = new Hono<{ Variables: MailRouterVars }>()
  // GET /mailboxes — list all mailboxes for the authenticated account.
  // Creates the default set (inbox/sent/drafts/archive/trash) on first call.
  .get('/mailboxes', async (c) => {
    const { db, accountId, mintId } = c.var
    await ensureDefaultMailboxes(db, accountId, mintId)
    const rows = await listMailboxes(db, accountId)
    return c.json({ mailboxes: rows })
  })

  // GET /mails?mailboxId=...&before=<ms>&limit=...
  .get('/mails', async (c) => {
    const { db, accountId } = c.var
    const mailboxId = c.req.query('mailboxId')
    const beforeMs = c.req.query('before')
    const limitStr = c.req.query('limit')
    const limit = limitStr ? Math.max(1, Math.min(parseInt(limitStr, 10) || 50, 200)) : 50
    const before = beforeMs ? new Date(parseInt(beforeMs, 10)) : undefined

    const rows = await listMails(db, { accountId, mailboxId, before, limit })
    return c.json({ mails: rows, nextBefore: rows.at(-1)?.receivedAt.getTime() ?? null })
  })

  // GET /mails/:id — full message including body.
  .get('/mails/:id', async (c) => {
    const { db, accountId } = c.var
    const row = await getMail(db, { accountId, mailId: c.req.param('id') })
    if (!row) throw MAIL.notFound('mail not found')
    return c.json({ mail: row })
  })

  // POST /mails — outbound send. Body schema documented above.
  // From address defaults to `${accountId}@<MAIL_DOMAIN>` — apps/mail
  // injects a default via `c.set('defaultFromAddr', ...)` when needed.
  .post('/mails', async (c) => {
    const { db, accountId, sender, mintId } = c.var
    const parsed = sendBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      throw MAIL.invalidBody('request body failed validation', {
        issues: parsed.error.flatten(),
      })
    }
    const body = parsed.data

    const from =
      body.from ??
      ({ mail: c.get('defaultFromAddr' as never) as unknown as string } as { mail: string })
    if (!from?.mail) {
      throw MAIL.fromRequired('from address is required')
    }

    try {
      const row = await sendMail(
        db,
        {
          accountId,
          sender,
          message: {
            from,
            to: body.to,
            cc: body.cc,
            bcc: body.bcc,
            replyTo: body.replyTo,
            subject: body.subject,
            text: body.text,
            html: body.html,
          },
        },
        mintId,
      )
      return c.json({ mail: row }, 202)
    } catch (err) {
      // sendMail already persisted the row with deliveryStatus='failed';
      // surface a 502 so the client can retry.
      throw MAIL.sendFailed(err instanceof Error ? err.message : String(err))
    }
  })
  .onError((err, c) => {
    if (err instanceof MailError) {
      return c.json(envelope(c, err), err.status as 400 | 401 | 404 | 429 | 500 | 502 | 503)
    }
    const internal = MAIL.internal('unexpected error')
    return c.json(envelope(c, internal), 500)
  })
