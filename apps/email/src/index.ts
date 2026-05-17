// citizenry-email — HTTP email API (REST) + Cloudflare Email Workers handler.
//
// HTTP surface (Bearer JWT, audience JWT_AUDIENCE):
//   GET  /_health                — unauthenticated probe
//   GET  /.well-known/email-api   — discovery document (capabilities + URLs)
//   GET  /mailboxes              — list mailboxes (auto-creates defaults)
//   GET  /emails?mailboxId=…&before=…&limit=…
//   GET  /emails/:id
//   POST /emails                 — outbound send
//
// Email Workers handler (`email`):
//   Cloudflare delivers parsed messages addressed to <EMAIL_DOMAIN> here.
//   The handler resolves <local>@EMAIL_DOMAIN → agent.slug → account_id,
//   then persists into the recipient's Inbox.

import { Hono } from 'hono'
import { emailRouter, type EmailRouterVars } from '@citizenry/email'
import type { Bindings } from './env'
import { emailDb, type EmailVars } from './db'
import { bearerAuth, type AuthVars } from './middleware/auth'
import { handleInboundEmail } from './inbound/handler'
import { pickSender } from './outbound'
import { mintId } from './ids'

const app = new Hono<{ Bindings: Bindings }>()

app.get('/_health', (c) => c.json({ service: 'citizenry-email', status: 'ok' }))

// Discovery — clients fetch this to learn the API base URL and limits.
// Modeled on JMAP's session resource but trimmed to the REST surface.
app.get('/.well-known/email-api', (c) => {
  const url = new URL(c.req.url)
  const base = `${url.protocol}//${url.host}`
  return c.json({
    service: 'citizenry-email',
    apiVersion: 'v1',
    apiBase: base,
    capabilities: {
      maxEmailsPerPage: 200,
      maxAttachmentBytes: 25 * 1024 * 1024,
      outboundEnabled: true,
    },
    authentication: {
      type: 'bearer',
      audience: (c.env.JWT_AUDIENCE || '').split(',').map((s) => s.trim()).filter(Boolean),
    },
    routes: {
      mailboxes: `${base}/mailboxes`,
      emails: `${base}/emails`,
      emailById: `${base}/emails/{emailId}`,
      sendEmail: `${base}/emails`,
    },
  })
})

app.use('*', bearerAuth)

// Mount the package router with the db + sender + minter injected.
const mountedRouter = new Hono<{
  Bindings: Bindings
  Variables: AuthVars & EmailVars & EmailRouterVars
}>()
  .use('*', emailDb)
  .use('*', async (c, next) => {
    c.set('sender', pickSender(c.env))
    c.set('mintId', mintId)
    // accountId is set by bearerAuth — re-bind under the router's expected key.
    c.set('accountId', c.var.accountId)
    // Default From: agent_id@EMAIL_DOMAIN. Clients can override per-call.
    c.set('defaultFromAddr' as never, `${c.var.accountId}@${c.env.EMAIL_DOMAIN}` as never)
    await next()
  })
  .route('/', emailRouter)

app.route('/', mountedRouter)

export default {
  fetch: app.fetch,
  /**
   * Cloudflare Email Workers entry. Configure CF Email Routing for
   * EMAIL_DOMAIN to deliver to this Worker; messages addressed to
   * agents we recognize land in the Inbox, the rest are dropped.
   */
  async email(
    message: Parameters<typeof handleInboundEmail>[0],
    env: Bindings,
    ctx: { waitUntil: (p: Promise<unknown>) => void },
  ) {
    return handleInboundEmail(message, env, ctx)
  },
}
