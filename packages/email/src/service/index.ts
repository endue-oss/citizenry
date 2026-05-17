// Email service layer — pure (no Worker globals). The apps/email Worker
// instantiates a Db and a EmailSender and passes both in.

import { and, eq, desc, lte, sql } from 'drizzle-orm'
import { schema, type Db, type EmailRow, type MailboxRow, type AddressEntry } from '../db'
import { WELL_KNOWN_ROLES, type WellKnownRole } from '../db/schema'

const { mailbox, email, emailAttachment } = schema

/** Provider that delivers outbound email. Implementations live in apps/email. */
export interface EmailSender {
  name: string
  /** Throws on hard failure. Returns the provider's message id on success. */
  send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }>
}

export type OutboundMessage = {
  from: AddressEntry
  to: AddressEntry[]
  cc?: AddressEntry[]
  bcc?: AddressEntry[]
  replyTo?: AddressEntry[]
  subject: string
  text?: string
  html?: string
}

/** Inputs to storeInbound — produced by apps/email/src/inbound from postal-mime. */
export type InboundEmail = {
  accountId: string
  messageId: string | null
  inReplyTo: string | null
  refs: string[]
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  from: AddressEntry | null
  to: AddressEntry[]
  cc: AddressEntry[]
  bcc: AddressEntry[]
  replyTo: AddressEntry[]
  receivedAt: Date
  sentAt: Date | null
  size: number
  attachments: Array<{
    filename: string | null
    contentType: string
    cid: string | null
    inline: boolean
    bytes: Uint8Array
  }>
}

export type IdMinter = (kind: 'MAILBOX' | 'EMAIL' | 'ATTACHMENT' | 'THREAD') => string

// ── mailboxes ──────────────────────────────────────────────────────

const DEFAULT_MAILBOXES: ReadonlyArray<{ name: string; role: WellKnownRole }> = [
  { name: 'Inbox', role: 'inbox' },
  { name: 'Sent', role: 'sent' },
  { name: 'Drafts', role: 'drafts' },
  { name: 'Archive', role: 'archive' },
  { name: 'Trash', role: 'trash' },
]

/** Ensure the five well-known mailboxes exist for an account. Idempotent. */
export async function ensureDefaultMailboxes(
  db: Db,
  accountId: string,
  mintId: IdMinter,
): Promise<MailboxRow[]> {
  const existing = await db.select().from(mailbox).where(eq(mailbox.accountId, accountId))
  const byRole = new Map(existing.filter((m) => m.role).map((m) => [m.role!, m]))

  const toInsert: typeof mailbox.$inferInsert[] = []
  for (const def of DEFAULT_MAILBOXES) {
    if (byRole.has(def.role)) continue
    toInsert.push({
      mailboxId: mintId('MAILBOX'),
      accountId,
      name: def.name,
      role: def.role,
    })
  }
  if (toInsert.length > 0) {
    await db.insert(mailbox).values(toInsert)
  }
  return db.select().from(mailbox).where(eq(mailbox.accountId, accountId))
}

export async function listMailboxes(db: Db, accountId: string): Promise<MailboxRow[]> {
  return db.select().from(mailbox).where(eq(mailbox.accountId, accountId))
}

async function mailboxByRole(
  db: Db,
  accountId: string,
  role: WellKnownRole,
): Promise<MailboxRow | null> {
  const rows = await db
    .select()
    .from(mailbox)
    .where(and(eq(mailbox.accountId, accountId), eq(mailbox.role, role)))
    .limit(1)
  return rows[0] ?? null
}

// ── emails ─────────────────────────────────────────────────────────

const PREVIEW_LEN = 256

export type EmailListItem = Omit<EmailRow, 'bodyText' | 'bodyHtml'>

export async function listEmails(
  db: Db,
  args: {
    accountId: string
    mailboxId?: string
    before?: Date
    limit?: number
  },
): Promise<EmailListItem[]> {
  const limit = Math.min(args.limit ?? 50, 200)
  const conditions = [eq(email.accountId, args.accountId)]
  if (args.mailboxId) conditions.push(eq(email.mailboxId, args.mailboxId))
  if (args.before) conditions.push(lte(email.receivedAt, args.before))

  const rows = await db
    .select({
      emailId: email.emailId,
      accountId: email.accountId,
      mailboxId: email.mailboxId,
      threadId: email.threadId,
      messageId: email.messageId,
      inReplyTo: email.inReplyTo,
      refs: email.refs,
      subject: email.subject,
      preview: email.preview,
      fromAddr: email.fromAddr,
      toAddrs: email.toAddrs,
      ccAddrs: email.ccAddrs,
      bccAddrs: email.bccAddrs,
      replyToAddrs: email.replyToAddrs,
      keywords: email.keywords,
      size: email.size,
      hasAttachment: email.hasAttachment,
      receivedAt: email.receivedAt,
      sentAt: email.sentAt,
      direction: email.direction,
      deliveryStatus: email.deliveryStatus,
      deliveryError: email.deliveryError,
      providerMessageId: email.providerMessageId,
      createdAt: email.createdAt,
    })
    .from(email)
    .where(and(...conditions))
    .orderBy(desc(email.receivedAt))
    .limit(limit)

  return rows
}

export async function getEmail(
  db: Db,
  args: { accountId: string; emailId: string },
): Promise<EmailRow | null> {
  const rows = await db
    .select()
    .from(email)
    .where(and(eq(email.accountId, args.accountId), eq(email.emailId, args.emailId)))
    .limit(1)
  return rows[0] ?? null
}

// ── inbound ────────────────────────────────────────────────────────

/**
 * Persist a parsed inbound message into the recipient's Inbox.
 *
 * Idempotent on (account_id, message_id): if a row with the same
 * Message-ID already exists for the account, returns it without
 * inserting again. This handles CF Email Worker retries and forks.
 */
export async function storeInbound(
  db: Db,
  msg: InboundEmail,
  mintId: IdMinter,
): Promise<EmailRow> {
  // Idempotency check on Message-ID. NULL message-id falls through and
  // always inserts — those are rare and replaying them is acceptable for v1.
  if (msg.messageId) {
    const dup = await db
      .select()
      .from(email)
      .where(and(eq(email.accountId, msg.accountId), eq(email.messageId, msg.messageId)))
      .limit(1)
    if (dup[0]) return dup[0]
  }

  await ensureDefaultMailboxes(db, msg.accountId, mintId)
  const inbox = await mailboxByRole(db, msg.accountId, 'inbox')
  if (!inbox) throw new Error('inbox mailbox missing after ensureDefaultMailboxes')

  const threadId = computeThreadId(msg.refs, msg.inReplyTo, msg.messageId, mintId)
  const emailId = mintId('EMAIL')
  const preview = (msg.bodyText ?? msg.bodyHtml ?? '').slice(0, PREVIEW_LEN)

  await db.insert(email).values({
    emailId,
    accountId: msg.accountId,
    mailboxId: inbox.mailboxId,
    threadId,
    messageId: msg.messageId,
    inReplyTo: msg.inReplyTo,
    refs: JSON.stringify(msg.refs),
    subject: msg.subject,
    preview,
    bodyText: msg.bodyText,
    bodyHtml: msg.bodyHtml,
    fromAddr: msg.from?.email ?? null,
    toAddrs: JSON.stringify(msg.to),
    ccAddrs: JSON.stringify(msg.cc),
    bccAddrs: JSON.stringify(msg.bcc),
    replyToAddrs: JSON.stringify(msg.replyTo),
    keywords: '{}',
    size: msg.size,
    hasAttachment: msg.attachments.length > 0 ? 1 : 0,
    receivedAt: msg.receivedAt,
    sentAt: msg.sentAt,
    direction: 'inbound',
    deliveryStatus: 'received',
  })

  for (const att of msg.attachments) {
    await db.insert(emailAttachment).values({
      attachmentId: mintId('ATTACHMENT'),
      emailId,
      filename: att.filename,
      contentType: att.contentType,
      size: att.bytes.byteLength,
      cid: att.cid,
      inline: att.inline ? 1 : 0,
      blob: att.bytes,
    })
  }

  await bumpMailboxCounters(db, inbox.mailboxId, { totalDelta: 1, unreadDelta: 1 })

  const inserted = await getEmail(db, { accountId: msg.accountId, emailId })
  if (!inserted) throw new Error('insert succeeded but row not found')
  return inserted
}

// ── outbound ───────────────────────────────────────────────────────

/**
 * Send a message via the configured EmailSender, persist it into the Sent
 * folder, and record the delivery status. Failures leave a row with
 * deliveryStatus='failed' so operators can inspect.
 */
export async function sendEmail(
  db: Db,
  args: {
    accountId: string
    sender: EmailSender
    message: OutboundMessage
  },
  mintId: IdMinter,
): Promise<EmailRow> {
  await ensureDefaultMailboxes(db, args.accountId, mintId)
  const sent = await mailboxByRole(db, args.accountId, 'sent')
  if (!sent) throw new Error('sent mailbox missing after ensureDefaultMailboxes')

  const now = new Date()
  const emailId = mintId('EMAIL')
  const threadId = mintId('THREAD')
  const preview = (args.message.text ?? args.message.html ?? '').slice(0, PREVIEW_LEN)
  const size = computeOutboundSize(args.message)

  // Insert as 'queued' before calling the provider so a crash mid-send
  // leaves a trace.
  await db.insert(email).values({
    emailId,
    accountId: args.accountId,
    mailboxId: sent.mailboxId,
    threadId,
    messageId: null,
    inReplyTo: null,
    refs: '[]',
    subject: args.message.subject,
    preview,
    bodyText: args.message.text ?? null,
    bodyHtml: args.message.html ?? null,
    fromAddr: args.message.from.email,
    toAddrs: JSON.stringify(args.message.to),
    ccAddrs: JSON.stringify(args.message.cc ?? []),
    bccAddrs: JSON.stringify(args.message.bcc ?? []),
    replyToAddrs: JSON.stringify(args.message.replyTo ?? []),
    keywords: '{"$seen":true}',
    size,
    hasAttachment: 0,
    receivedAt: now,
    sentAt: now,
    direction: 'outbound',
    deliveryStatus: 'queued',
  })

  try {
    const { providerMessageId } = await args.sender.send(args.message)
    await db
      .update(email)
      .set({ deliveryStatus: 'sent', providerMessageId })
      .where(eq(email.emailId, emailId))
  } catch (err) {
    await db
      .update(email)
      .set({
        deliveryStatus: 'failed',
        deliveryError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(email.emailId, emailId))
    throw err
  }

  await bumpMailboxCounters(db, sent.mailboxId, { totalDelta: 1, unreadDelta: 0 })

  const inserted = await getEmail(db, { accountId: args.accountId, emailId })
  if (!inserted) throw new Error('insert succeeded but row not found')
  return inserted
}

// ── helpers ────────────────────────────────────────────────────────

async function bumpMailboxCounters(
  db: Db,
  mailboxId: string,
  delta: { totalDelta: number; unreadDelta: number },
) {
  if (delta.totalDelta === 0 && delta.unreadDelta === 0) return
  await db
    .update(mailbox)
    .set({
      totalEmails: sql`total_emails + ${delta.totalDelta}`,
      unreadEmails: sql`unread_emails + ${delta.unreadDelta}`,
    })
    .where(eq(mailbox.mailboxId, mailboxId))
}

/**
 * Pick a thread id. v1 heuristic:
 *   - If References / In-Reply-To carries an existing thread anchor, reuse
 *     its Message-ID-derived bucket.
 *   - Otherwise mint a fresh thread id.
 *
 * v1 stores Message-IDs but does not yet query them for thread merging.
 * That's an intentional simplification — clients can group by `threadId`
 * for the messages they receive, and a backfill can merge later.
 */
function computeThreadId(
  refs: string[],
  inReplyTo: string | null,
  _messageId: string | null,
  mintId: IdMinter,
): string {
  // Future: look up an anchor message by refs[0]/inReplyTo; if found,
  // adopt its thread_id. For now: every inbound starts its own thread.
  if (refs.length > 0 || inReplyTo) {
    return mintId('THREAD')
  }
  return mintId('THREAD')
}

function computeOutboundSize(msg: OutboundMessage): number {
  return (msg.text ?? '').length + (msg.html ?? '').length + (msg.subject ?? '').length
}

export { mailboxByRole, WELL_KNOWN_ROLES }
