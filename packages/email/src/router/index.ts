// HTTP router for the email Worker. Pure surface — no Worker globals;
// apps/email wires it into a Hono app with a Db middleware and a EmailSender.

import { Hono, type MiddlewareHandler } from 'hono'
import { z } from 'zod'
import type { Db } from '../db'
import {
  getEmail,
  listEmails,
  listMailboxes,
  sendEmail,
  ensureDefaultMailboxes,
  type IdMinter,
  type EmailSender,
} from '../service'

export type EmailRouterVars = {
  db: Db
  /** agent.principal_id resolved by Bearer auth in apps/email. */
  accountId: string
  /** Mint a prefixed ULID. Provided by apps/email (which owns the runtime). */
  mintId: IdMinter
  /** Outbound provider. Provided by apps/email. */
  sender: EmailSender
}

const addressSchema = z.object({
  name: z.string().max(255).optional(),
  email: z.string().email(),
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

export const emailRouter = new Hono<{ Variables: EmailRouterVars }>()
  // GET /mailboxes — list all mailboxes for the authenticated account.
  // Creates the default set (inbox/sent/drafts/archive/trash) on first call.
  .get('/mailboxes', async (c) => {
    const { db, accountId, mintId } = c.var
    await ensureDefaultMailboxes(db, accountId, mintId)
    const rows = await listMailboxes(db, accountId)
    return c.json({ mailboxes: rows })
  })

  // GET /emails?mailboxId=...&before=<ms>&limit=...
  .get('/emails', async (c) => {
    const { db, accountId } = c.var
    const mailboxId = c.req.query('mailboxId')
    const beforeMs = c.req.query('before')
    const limitStr = c.req.query('limit')
    const limit = limitStr ? Math.max(1, Math.min(parseInt(limitStr, 10) || 50, 200)) : 50
    const before = beforeMs ? new Date(parseInt(beforeMs, 10)) : undefined

    const rows = await listEmails(db, { accountId, mailboxId, before, limit })
    return c.json({ emails: rows, nextBefore: rows.at(-1)?.receivedAt.getTime() ?? null })
  })

  // GET /emails/:id — full message including body.
  .get('/emails/:id', async (c) => {
    const { db, accountId } = c.var
    const row = await getEmail(db, { accountId, emailId: c.req.param('id') })
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ email: row })
  })

  // POST /emails — outbound send. Body schema documented above.
  // From address defaults to `${accountId}@<EMAIL_DOMAIN>` — apps/email
  // injects a default via `c.set('defaultFromAddr', ...)` when needed.
  .post('/emails', async (c) => {
    const { db, accountId, sender, mintId } = c.var
    const parsed = sendBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ error: 'invalid_body', issues: parsed.error.flatten() }, 400)
    }
    const body = parsed.data

    const from =
      body.from ??
      ({ email: c.get('defaultFromAddr' as never) as unknown as string } as { email: string })
    if (!from?.email) {
      return c.json({ error: 'from_required' }, 400)
    }

    try {
      const row = await sendEmail(
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
      return c.json({ email: row }, 202)
    } catch (err) {
      // sendEmail already persisted the row with deliveryStatus='failed';
      // surface a 502 so the client can retry.
      return c.json(
        { error: 'send_failed', message: err instanceof Error ? err.message : String(err) },
        502,
      )
    }
  })
