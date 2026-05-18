// Mail service layer — pure (no Worker globals). The apps/mail Worker
// instantiates a Db and a MailSender and passes both in.

import { and, eq, desc, lte, sql } from 'drizzle-orm'
import { schema, type Db, type MailRow, type MailboxRow, type AddressEntry } from '../db'
import { WELL_KNOWN_ROLES, type WellKnownRole } from '../db/schema'

const { mailbox, mail, mailAttachment } = schema

/** Provider that delivers outbound mail. Implementations live in apps/mail. */
export interface MailSender {
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

/** Inputs to storeInbound — produced by apps/mail/src/inbound from postal-mime. */
export type InboundMail = {
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

export type IdMinter = (kind: 'MAILBOX' | 'MAIL' | 'ATTACHMENT' | 'THREAD') => string

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

// ── mails ──────────────────────────────────────────────────────────

const PREVIEW_LEN = 256

export type MailListItem = Omit<MailRow, 'bodyText' | 'bodyHtml'>

export async function listMails(
  db: Db,
  args: {
    accountId: string
    mailboxId?: string
    before?: Date
    limit?: number
  },
): Promise<MailListItem[]> {
  const limit = Math.min(args.limit ?? 50, 200)
  const conditions = [eq(mail.accountId, args.accountId)]
  if (args.mailboxId) conditions.push(eq(mail.mailboxId, args.mailboxId))
  if (args.before) conditions.push(lte(mail.receivedAt, args.before))

  const rows = await db
    .select({
      mailId: mail.mailId,
      accountId: mail.accountId,
      mailboxId: mail.mailboxId,
      threadId: mail.threadId,
      messageId: mail.messageId,
      inReplyTo: mail.inReplyTo,
      refs: mail.refs,
      subject: mail.subject,
      preview: mail.preview,
      fromAddr: mail.fromAddr,
      toAddrs: mail.toAddrs,
      ccAddrs: mail.ccAddrs,
      bccAddrs: mail.bccAddrs,
      replyToAddrs: mail.replyToAddrs,
      keywords: mail.keywords,
      size: mail.size,
      hasAttachment: mail.hasAttachment,
      receivedAt: mail.receivedAt,
      sentAt: mail.sentAt,
      direction: mail.direction,
      deliveryStatus: mail.deliveryStatus,
      deliveryError: mail.deliveryError,
      providerMessageId: mail.providerMessageId,
      createdAt: mail.createdAt,
    })
    .from(mail)
    .where(and(...conditions))
    .orderBy(desc(mail.receivedAt))
    .limit(limit)

  return rows
}

export async function getMail(
  db: Db,
  args: { accountId: string; mailId: string },
): Promise<MailRow | null> {
  const rows = await db
    .select()
    .from(mail)
    .where(and(eq(mail.accountId, args.accountId), eq(mail.mailId, args.mailId)))
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
  msg: InboundMail,
  mintId: IdMinter,
): Promise<MailRow> {
  // Idempotency check on Message-ID. NULL message-id falls through and
  // always inserts — those are rare and replaying them is acceptable for v1.
  if (msg.messageId) {
    const dup = await db
      .select()
      .from(mail)
      .where(and(eq(mail.accountId, msg.accountId), eq(mail.messageId, msg.messageId)))
      .limit(1)
    if (dup[0]) return dup[0]
  }

  await ensureDefaultMailboxes(db, msg.accountId, mintId)
  const inbox = await mailboxByRole(db, msg.accountId, 'inbox')
  if (!inbox) throw new Error('inbox mailbox missing after ensureDefaultMailboxes')

  const threadId = computeThreadId(msg.refs, msg.inReplyTo, msg.messageId, mintId)
  const mailId = mintId('MAIL')
  const preview = (msg.bodyText ?? msg.bodyHtml ?? '').slice(0, PREVIEW_LEN)

  await db.insert(mail).values({
    mailId,
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
    fromAddr: msg.from?.mail ?? null,
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
    await db.insert(mailAttachment).values({
      attachmentId: mintId('ATTACHMENT'),
      mailId,
      filename: att.filename,
      contentType: att.contentType,
      size: att.bytes.byteLength,
      cid: att.cid,
      inline: att.inline ? 1 : 0,
      blob: att.bytes,
    })
  }

  await bumpMailboxCounters(db, inbox.mailboxId, { totalDelta: 1, unreadDelta: 1 })

  const inserted = await getMail(db, { accountId: msg.accountId, mailId })
  if (!inserted) throw new Error('insert succeeded but row not found')
  return inserted
}

// ── outbound ───────────────────────────────────────────────────────

/**
 * Send a message via the configured MailSender, persist it into the Sent
 * folder, and record the delivery status. Failures leave a row with
 * deliveryStatus='failed' so operators can inspect.
 */
export async function sendMail(
  db: Db,
  args: {
    accountId: string
    sender: MailSender
    message: OutboundMessage
  },
  mintId: IdMinter,
): Promise<MailRow> {
  await ensureDefaultMailboxes(db, args.accountId, mintId)
  const sent = await mailboxByRole(db, args.accountId, 'sent')
  if (!sent) throw new Error('sent mailbox missing after ensureDefaultMailboxes')

  const now = new Date()
  const mailId = mintId('MAIL')
  const threadId = mintId('THREAD')
  const preview = (args.message.text ?? args.message.html ?? '').slice(0, PREVIEW_LEN)
  const size = computeOutboundSize(args.message)

  // Insert as 'queued' before calling the provider so a crash mid-send
  // leaves a trace.
  await db.insert(mail).values({
    mailId,
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
    fromAddr: args.message.from.mail,
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
      .update(mail)
      .set({ deliveryStatus: 'sent', providerMessageId })
      .where(eq(mail.mailId, mailId))
  } catch (err) {
    await db
      .update(mail)
      .set({
        deliveryStatus: 'failed',
        deliveryError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(mail.mailId, mailId))
    throw err
  }

  await bumpMailboxCounters(db, sent.mailboxId, { totalDelta: 1, unreadDelta: 0 })

  const inserted = await getMail(db, { accountId: args.accountId, mailId })
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
      totalMails: sql`total_mails + ${delta.totalDelta}`,
      unreadMails: sql`unread_mails + ${delta.unreadDelta}`,
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
