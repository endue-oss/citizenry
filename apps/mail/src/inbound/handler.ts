// Inbound mail handler — invoked by Cloudflare Email Workers when a message
// arrives at one of the routed addresses for MAIL_DOMAIN. The recipient's
// local-part identifies the account (we resolve `local@MAIL_DOMAIN` →
// `account_id`).
//
// The handler is observability-first: every invocation leaves a row in
// `mail_inbound_log`, including drops. Operators can verify mail is
// arriving with:
//
//   wrangler d1 execute citizenry-mail-db --remote \
//     --command="SELECT * FROM mail_inbound_log ORDER BY received_at DESC LIMIT 20;"
//
// Stored messages land in `mail` AND get a 'stored' row in the log;
// dropped messages stay in the log with `mail_id IS NULL` and a
// disposition that explains why.

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import PostalMime from 'postal-mime'
import { schema as identitySchema } from '@citizenry/identity/schema'
import { schema as mailSchema } from '@citizenry/mail/schema'
import {
  storeInbound,
  recordInboundLog,
  type InboundMail,
  type AddressEntry,
  type InboundDisposition,
} from '@citizenry/mail'
import { mintId } from '../ids'
import type { Bindings } from '../env'

// Cloudflare Email Worker message shape — see @cloudflare/workers-types
// `ForwardableEmailMessage`. We minimize the surface we use here so the
// import stays compatible across worker-types versions.
type ForwardableLike = {
  from: string
  to: string
  headers: Headers
  raw: ReadableStream<Uint8Array>
  rawSize: number
  setReject?: (reason: string) => void
}

type LogCtx = {
  rcptTo: string
  mailFrom: string | null
  rawSize: number | null
}

export async function handleInboundMail(
  message: ForwardableLike,
  env: Bindings,
  _ctx: { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
  const mailDb = drizzle(env.DB_MAIL, { schema: mailSchema })
  const logCtx: LogCtx = {
    rcptTo: message.to,
    mailFrom: message.from ?? null,
    rawSize: typeof message.rawSize === 'number' ? message.rawSize : null,
  }

  const recipient = message.to.toLowerCase()
  const at = recipient.lastIndexOf('@')
  if (at < 0) {
    await record(mailDb, logCtx, { disposition: 'malformed_recipient' })
    return
  }

  const local = recipient.slice(0, at)
  const host = recipient.slice(at + 1)

  if (host !== env.MAIL_DOMAIN.toLowerCase()) {
    await record(mailDb, logCtx, {
      disposition: 'wrong_host',
      errorMessage: `expected host '${env.MAIL_DOMAIN}', got '${host}'`,
    })
    return
  }

  const accountId = await resolveLocalPart(env, local)
  if (!accountId) {
    await record(mailDb, logCtx, { disposition: 'unresolved_recipient' })
    return
  }

  let parsed: Awaited<ReturnType<PostalMime['parse']>>
  try {
    const buf = await streamToArrayBuffer(message.raw)
    parsed = await new PostalMime().parse(buf)
  } catch (err) {
    await record(mailDb, logCtx, {
      disposition: 'parse_failed',
      accountId,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    return
  }

  const refs = parseRefHeader(parsed.references ?? null)
  const inbound: InboundMail = {
    accountId,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    refs,
    subject: parsed.subject ?? null,
    bodyText: parsed.text ?? null,
    bodyHtml: parsed.html ?? null,
    from: parsed.from ? toAddressEntry(parsed.from) : null,
    to: (parsed.to ?? []).map(toAddressEntry),
    cc: (parsed.cc ?? []).map(toAddressEntry),
    bcc: (parsed.bcc ?? []).map(toAddressEntry),
    replyTo: (parsed.replyTo ?? []).map(toAddressEntry),
    receivedAt: new Date(),
    sentAt: parsed.date ? new Date(parsed.date) : null,
    size: message.rawSize,
    attachments: (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? null,
      contentType: a.mimeType ?? 'application/octet-stream',
      cid: a.contentId ?? null,
      inline: a.disposition === 'inline',
      bytes: toUint8Array(a.content),
    })),
  }

  try {
    const result = await storeInbound(mailDb, inbound, mintId)
    await record(mailDb, logCtx, {
      disposition: result.duplicate ? 'duplicate' : 'stored',
      accountId,
      mailId: result.mail.mailId,
      messageId: inbound.messageId,
    })
  } catch (err) {
    await record(mailDb, logCtx, {
      disposition: 'store_failed',
      accountId,
      messageId: inbound.messageId,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// ── audit ──────────────────────────────────────────────────────────

type RecordInput = {
  disposition: InboundDisposition
  accountId?: string | null
  mailId?: string | null
  messageId?: string | null
  errorMessage?: string | null
}

async function record(
  db: ReturnType<typeof drizzle<typeof mailSchema>>,
  ctx: LogCtx,
  input: RecordInput,
): Promise<void> {
  const logId = mintId('INBOUND_LOG')
  const line = {
    inbound: input.disposition,
    rcpt_to: ctx.rcptTo,
    mail_from: ctx.mailFrom,
    raw_size: ctx.rawSize,
    account_id: input.accountId ?? null,
    mail_id: input.mailId ?? null,
    message_id: input.messageId ?? null,
    error_message: input.errorMessage ?? null,
    inbound_log_id: logId,
  }
  console.log(JSON.stringify(line))

  try {
    await recordInboundLog(db, {
      logId,
      rcptTo: ctx.rcptTo,
      mailFrom: ctx.mailFrom,
      rawSize: ctx.rawSize,
      disposition: input.disposition,
      accountId: input.accountId,
      mailId: input.mailId,
      messageId: input.messageId,
      errorMessage: input.errorMessage,
    })
  } catch (err) {
    // Audit-log write failure is logged but never throws — a broken
    // inbound_log table must not also break the primary delivery path.
    console.log(
      JSON.stringify({
        inbound: 'audit_write_failed',
        inbound_log_id: logId,
        error_message: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}

// ── helpers ────────────────────────────────────────────────────────

/**
 * Resolve a local-part to an agent's principal_id.
 *
 * v1 convention: `agent.slug` is the local-part. This means
 * `<slug>@<MAIL_DOMAIN>` routes to the matching agent. Customizing the
 * mapping (e.g. allow aliases) is a future PR.
 */
async function resolveLocalPart(env: Bindings, local: string): Promise<string | null> {
  const db = drizzle(env.DB_IDENTITY, { schema: identitySchema })
  const rows = await db
    .select({ principalId: identitySchema.agent.principalId })
    .from(identitySchema.agent)
    .where(eq(identitySchema.agent.slug, local))
    .limit(1)
  return rows[0]?.principalId ?? null
}

function parseRefHeader(refs: string | null): string[] {
  if (!refs) return []
  // References is whitespace-separated <id> tokens (RFC 5322 §3.6.4).
  return refs
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function toAddressEntry(a: { name?: string; address?: string }): AddressEntry {
  return {
    name: a.name && a.name.length > 0 ? a.name : undefined,
    mail: (a.address ?? '').toLowerCase(),
  }
}

async function streamToArrayBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.byteLength
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out.buffer
}

function toUint8Array(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (content instanceof Uint8Array) return content
  if (typeof content === 'string') return new TextEncoder().encode(content)
  return new Uint8Array(content)
}
