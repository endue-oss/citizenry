// citizenry-mail — HTTP mail API (REST) + Cloudflare Email Workers handler.
//
// HTTP surface (Bearer JWT, audience JWT_AUDIENCE):
//   GET  /_health                — unauthenticated probe
//   GET  /.well-known/mail-api   — discovery document (capabilities + URLs)
//   GET  /mailboxes              — list mailboxes (auto-creates defaults)
//   GET  /mails?mailboxId=…&before=…&limit=…
//   GET  /mails/:id
//   POST /mails                  — outbound send
//
// Email Workers handler (`email`):
//   Cloudflare delivers parsed messages addressed to <MAIL_DOMAIN> here.
//   The handler resolves <local>@MAIL_DOMAIN → agent.slug → account_id,
//   then persists into the recipient's Inbox.

import { Hono } from 'hono'
import { mailRouter, type MailRouterVars } from '@citizenry/mail'
import type { Bindings } from './env'
import { mailDb, type MailVars } from './db'
import { bearerAuth, type AuthVars } from './middleware/auth'
import { handleInboundMail } from './inbound/handler'
import { pickSender } from './outbound'
import { mintId } from './ids'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/_health', (c) => c.json({ service: 'citizenry-mail', status: 'ok' }))

// Discovery — clients fetch this to learn the API base URL and limits.
// Modeled on JMAP's session resource but trimmed to the REST surface.
app.get('/.well-known/mail-api', (c) => {
  const url = new URL(c.req.url)
  const base = `${url.protocol}//${url.host}`
  return c.json({
    service: 'citizenry-mail',
    apiVersion: 'v1',
    apiBase: base,
    capabilities: {
      maxMailsPerPage: 200,
      maxAttachmentBytes: 25 * 1024 * 1024,
      outboundEnabled: true,
    },
    authentication: {
      type: 'bearer',
      audience: (c.env.JWT_AUDIENCE || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    routes: {
      mailboxes: `${base}/mailboxes`,
      mails: `${base}/mails`,
      mailById: `${base}/mails/{mailId}`,
      sendMail: `${base}/mails`,
    },
  })
})

app.use('*', bearerAuth)

// Mount the package router with the db + sender + minter injected.
const mountedRouter = new Hono<{
  Bindings: Bindings
  Variables: AuthVars & MailVars & MailRouterVars
}>()
  .use('*', mailDb)
  .use('*', async (c, next) => {
    c.set('sender', pickSender(c.env))
    c.set('mintId', mintId)
    // accountId is set by bearerAuth — re-bind under the router's expected key.
    c.set('accountId', c.var.accountId)
    // Default From: agent_id@MAIL_DOMAIN. Clients can override per-call.
    c.set('defaultFromAddr' as never, `${c.var.accountId}@${c.env.MAIL_DOMAIN}` as never)
    await next()
  })
  .route('/', mailRouter)

app.route('/', mountedRouter)

export default {
  fetch: app.fetch,
  /**
   * Cloudflare Email Workers entry. Configure CF Email Routing for
   * MAIL_DOMAIN to deliver to this Worker; messages addressed to
   * agents we recognize land in the Inbox, the rest are dropped.
   */
  async email(
    message: Parameters<typeof handleInboundMail>[0],
    env: Bindings,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    return handleInboundMail(message, env, ctx)
  },
}
