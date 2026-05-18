// Inbound mail handler — invoked by Cloudflare Email Workers when a message
// arrives at one of the routed addresses for MAIL_DOMAIN. The recipient's
// local-part identifies the account (we resolve `local@MAIL_DOMAIN` →
// `account_id`).
//
// The handler:
//   1. Reads the raw RFC 5322 message stream into memory.
//   2. Parses it with postal-mime.
//   3. For each `to` whose host matches MAIL_DOMAIN, resolves the local-part
//      to an account_id and persists one row per account.
//   4. Unknown recipients are dropped silently (we don't reject — accepting
//      and then dropping is the conservative default for v0).

import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import PostalMime from 'postal-mime'
import { schema as identitySchema } from '@citizenry/identity/schema'
import { schema as mailSchema } from '@citizenry/mail/schema'
import { storeInbound, type InboundMail, type AddressEntry } from '@citizenry/mail'
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

export async function handleInboundMail(
  message: ForwardableLike,
  env: Bindings,
  _ctx: { waitUntil: (p: Promise<unknown>) => void },
): Promise<void> {
  const recipient = message.to.toLowerCase()
  const at = recipient.lastIndexOf('@')
  if (at < 0) return // malformed; drop silently

  const local = recipient.slice(0, at)
  const host = recipient.slice(at + 1)

  // Hard reject anything addressed to a host we don't own. CF's Email
  // Routing should not give us such a message, but defense in depth.
  if (host !== env.MAIL_DOMAIN.toLowerCase()) return

  const accountId = await resolveLocalPart(env, local)
  if (!accountId) {
    // No matching agent — drop silently. Logged for diagnostics.
    console.log(JSON.stringify({ inbound: 'unresolved_recipient', recipient }))
    return
  }

  // Stream → ArrayBuffer (CF Email max is 25 MiB). postal-mime accepts a
  // string, ArrayBuffer, Uint8Array, or Blob.
  const buf = await streamToArrayBuffer(message.raw)
  const parser = new PostalMime()
  const parsed = await parser.parse(buf)

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

  const db = drizzle(env.DB_MAIL, { schema: mailSchema })
  await storeInbound(db, inbound, mintId)
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
