// System-initiated outbound — drives /_internal/notify.
//
// Resolves a template + context into an OutboundMessage, hands it to
// the injected MailSender, and persists the result to mail_outbound_log.
// All callers (api, admin-api, ...) go through this path; nothing
// here knows about HTTP — that lives in apps/mail's route handler.
//
// See ADR-2026-0005.

import type { Db } from '../db'
import { schema, type OutboundStatus } from '../db/schema'
import { isKnownTemplate, renderTemplate, type TemplatePayload } from '../templates'
import type { MailSender, OutboundMessage } from './index'

export type NotifyRequest = {
  template: string
  to: Array<{ name?: string; mail: string }>
  context: Record<string, unknown>
  /** Optional override of the From envelope; defaults to `defaultFrom`. */
  from?: { name?: string; mail: string }
}

export type NotifyResult = {
  outboundLogId: string
  status: OutboundStatus
  providerMessageId: string | null
  errorMessage: string | null
  senderName: string
}

export type NotifyDeps = {
  db: Db
  sender: MailSender
  /** Envelope sender used when the request omits `from`. */
  defaultFrom: { name?: string; mail: string }
  /** Resource caller for audit purposes (e.g. `citizenry-api`). */
  caller: string | null
  /** ULID minter shared with the rest of mail. */
  mintLogId: () => string
}

/**
 * Run a notify request end-to-end. Always persists a row in
 * `mail_outbound_log`, regardless of outcome. Throws only when the
 * audit-log insert itself fails (the primary send path is reflected
 * via the returned `status`).
 */
export async function processNotify(
  deps: NotifyDeps,
  req: NotifyRequest,
): Promise<NotifyResult> {
  const outboundLogId = deps.mintLogId()

  if (!isKnownTemplate(req.template)) {
    await persist(deps, {
      outboundLogId,
      caller: deps.caller,
      template: req.template,
      to: req.to,
      from: null,
      status: 'invalid_request',
      providerMessageId: null,
      senderName: deps.sender.name,
      errorMessage: `unknown template: ${req.template}`,
    })
    return {
      outboundLogId,
      status: 'invalid_request',
      providerMessageId: null,
      errorMessage: `unknown template: ${req.template}`,
      senderName: deps.sender.name,
    }
  }

  if (!Array.isArray(req.to) || req.to.length === 0) {
    await persist(deps, {
      outboundLogId,
      caller: deps.caller,
      template: req.template,
      to: req.to ?? [],
      from: null,
      status: 'invalid_request',
      providerMessageId: null,
      senderName: deps.sender.name,
      errorMessage: 'to must be a non-empty array',
    })
    return {
      outboundLogId,
      status: 'invalid_request',
      providerMessageId: null,
      errorMessage: 'to must be a non-empty array',
      senderName: deps.sender.name,
    }
  }

  let rendered
  try {
    rendered = renderTemplate({
      template: req.template,
      context: req.context as never,
    } as TemplatePayload)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await persist(deps, {
      outboundLogId,
      caller: deps.caller,
      template: req.template,
      to: req.to,
      from: null,
      status: 'invalid_request',
      providerMessageId: null,
      senderName: deps.sender.name,
      errorMessage: `template render failed: ${msg}`,
    })
    return {
      outboundLogId,
      status: 'invalid_request',
      providerMessageId: null,
      errorMessage: `template render failed: ${msg}`,
      senderName: deps.sender.name,
    }
  }

  const from = req.from ?? deps.defaultFrom
  const message: OutboundMessage = {
    from,
    to: req.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  }

  try {
    const { providerMessageId } = await deps.sender.send(message)
    await persist(deps, {
      outboundLogId,
      caller: deps.caller,
      template: req.template,
      to: req.to,
      from,
      status: 'sent',
      providerMessageId: providerMessageId ?? null,
      senderName: deps.sender.name,
      errorMessage: null,
    })
    return {
      outboundLogId,
      status: 'sent',
      providerMessageId: providerMessageId ?? null,
      errorMessage: null,
      senderName: deps.sender.name,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await persist(deps, {
      outboundLogId,
      caller: deps.caller,
      template: req.template,
      to: req.to,
      from,
      status: 'failed',
      providerMessageId: null,
      senderName: deps.sender.name,
      errorMessage: msg,
    })
    return {
      outboundLogId,
      status: 'failed',
      providerMessageId: null,
      errorMessage: msg,
      senderName: deps.sender.name,
    }
  }
}

async function persist(
  deps: NotifyDeps,
  row: {
    outboundLogId: string
    caller: string | null
    template: string
    to: Array<{ name?: string; mail: string }>
    from: { name?: string; mail: string } | null
    status: OutboundStatus
    providerMessageId: string | null
    senderName: string
    errorMessage: string | null
  },
): Promise<void> {
  await deps.db.insert(schema.mailOutboundLog).values({
    outboundLogId: row.outboundLogId,
    requestedAt: new Date(),
    caller: row.caller,
    template: row.template,
    toAddrs: JSON.stringify(row.to),
    fromAddr: row.from?.mail ?? null,
    status: row.status,
    providerMessageId: row.providerMessageId,
    senderName: row.senderName,
    errorMessage: row.errorMessage,
  })
}
