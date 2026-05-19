// mail / citizenry — D1 (SQLite) schema.
//
// Conventions:
//   - account_id == agent.principal_id (the JWT 'sub'). One mail account per agent.
//   - All timestamps stored as INTEGER ms (unixepoch() * 1000).
//   - Address lists serialized as JSON arrays of `{ name?, mail }`.
//   - mailbox.role uses JMAP-style well-known roles (RFC 8621 §2). Custom
//     mailboxes have role=NULL.

import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  customType,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core'

// raw bytes — attachments. CF Workers gives Uint8Array; matches drizzle's
// non-buffer customType.
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'BLOB'
  },
})

// ── mailbox ─────────────────────────────────────────────────
// Named folders owned by an agent. Per-account well-known roles
// (inbox, sent, drafts, archive, trash, junk) are unique within the account.
export const mailbox = sqliteTable(
  'mailbox',
  {
    mailboxId: text('mailbox_id').primaryKey(),
    accountId: text('account_id').notNull(),
    name: text('name').notNull(),
    /** JMAP well-known role: 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'junk' | null */
    role: text('role'),
    totalMails: integer('total_mails').notNull().default(0),
    unreadMails: integer('unread_mails').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    accountNameUniq: uniqueIndex('mailbox_account_name_uniq').on(t.accountId, t.name),
    accountIdx: index('mailbox_account_idx').on(t.accountId),
    roleCheck: check(
      'mailbox_role_check',
      sql`role IS NULL OR role IN ('inbox','sent','drafts','archive','trash','junk')`,
    ),
  }),
)

// ── mail ───────────────────────────────────────────────────
// One row per message. `direction` distinguishes inbound (received via the
// Mail Worker pipeline) from outbound (sent via POST /mails). Both share
// the same shape so list/get endpoints don't branch.
export const mail = sqliteTable(
  'mail',
  {
    mailId: text('mail_id').primaryKey(),
    accountId: text('account_id').notNull(),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailbox.mailboxId, { onDelete: 'cascade' }),

    /** thr_<ULID> — bucketed by Message-ID hash or References chain. */
    threadId: text('thread_id').notNull(),
    /** RFC 5322 Message-ID — may be absent on malformed inbound mail. */
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    /** JSON array of Message-IDs from References + In-Reply-To headers. */
    refs: text('refs').notNull().default('[]'),

    subject: text('subject'),
    /** First ~256 chars of body for list views. */
    preview: text('preview'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),

    fromAddr: text('from_addr'),
    /** Each is a JSON array of `{ name?: string; mail: string }`. */
    toAddrs: text('to_addrs').notNull().default('[]'),
    ccAddrs: text('cc_addrs').notNull().default('[]'),
    bccAddrs: text('bcc_addrs').notNull().default('[]'),
    replyToAddrs: text('reply_to_addrs').notNull().default('[]'),

    /** JSON object: `{ "$seen": true, "$flagged": false, ... }`. */
    keywords: text('keywords').notNull().default('{}'),
    size: integer('size').notNull().default(0),
    hasAttachment: integer('has_attachment').notNull().default(0),

    receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),

    /** 'inbound' | 'outbound'. */
    direction: text('direction').notNull(),

    /** Outbound: 'queued' | 'sent' | 'failed'. Inbound: 'received'. */
    deliveryStatus: text('delivery_status').notNull(),
    /** Failure reason when deliveryStatus = 'failed'. */
    deliveryError: text('delivery_error'),
    /** Provider message id (e.g. Resend id) for traceability. */
    providerMessageId: text('provider_message_id'),

    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    accountIdx: index('mail_account_idx').on(t.accountId),
    mailboxReceivedIdx: index('mail_mailbox_received_idx').on(t.mailboxId, t.receivedAt),
    threadIdx: index('mail_thread_idx').on(t.accountId, t.threadId),
    messageIdIdx: index('mail_message_id_idx').on(t.messageId),
    directionCheck: check('mail_direction_check', sql`direction IN ('inbound','outbound')`),
    deliveryStatusCheck: check(
      'mail_delivery_status_check',
      sql`delivery_status IN ('received','queued','sent','failed')`,
    ),
  }),
)

// ── mail_attachment ────────────────────────────────────────
// Per-message attachment metadata + raw bytes. D1 BLOB is bounded by row
// size; large attachments are out of scope for v1 (move to R2 later).
export const mailAttachment = sqliteTable(
  'mail_attachment',
  {
    attachmentId: text('attachment_id').primaryKey(),
    mailId: text('mail_id')
      .notNull()
      .references(() => mail.mailId, { onDelete: 'cascade' }),
    filename: text('filename'),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Content-ID for inline parts (e.g. `<image001@example>`). */
    cid: text('cid'),
    inline: integer('inline').notNull().default(0),
    blob: bytes('blob').notNull(),
  },
  (t) => ({
    mailIdx: index('mail_attachment_mail_idx').on(t.mailId),
  }),
)

// ── mail_inbound_log ───────────────────────────────────────
// Audit row per Cloudflare Email Worker invocation, including drops.
// `mail_id` is set only when the message reached `mail`. `disposition`
// stays in sync with the CHECK constraint in migration 0002.
export const mailInboundLog = sqliteTable(
  'mail_inbound_log',
  {
    inboundLogId: text('inbound_log_id').primaryKey(),
    receivedAt: integer('received_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    rcptTo: text('rcpt_to').notNull(),
    mailFrom: text('mail_from'),
    rawSize: integer('raw_size'),
    disposition: text('disposition').notNull(),
    accountId: text('account_id'),
    mailId: text('mail_id'),
    messageId: text('message_id'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    receivedIdx: index('mail_inbound_log_received_idx').on(t.receivedAt),
    rcptToIdx: index('mail_inbound_log_rcpt_to_idx').on(t.rcptTo),
    dispositionIdx: index('mail_inbound_log_disposition_idx').on(t.disposition),
    dispositionCheck: check(
      'mail_inbound_log_disposition_check',
      sql`disposition IN ('stored','duplicate','malformed_recipient','wrong_host','unresolved_recipient','parse_failed','store_failed')`,
    ),
  }),
)

export const INBOUND_DISPOSITIONS = [
  'stored',
  'duplicate',
  'malformed_recipient',
  'wrong_host',
  'unresolved_recipient',
  'parse_failed',
  'store_failed',
] as const
export type InboundDisposition = (typeof INBOUND_DISPOSITIONS)[number]

// ── mail_outbound_log ──────────────────────────────────────
// System-initiated send audit (POST /_internal/notify). See ADR-2026-0005.
export const mailOutboundLog = sqliteTable(
  'mail_outbound_log',
  {
    outboundLogId: text('outbound_log_id').primaryKey(),
    requestedAt: integer('requested_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    caller: text('caller'),
    template: text('template').notNull(),
    toAddrs: text('to_addrs').notNull().default('[]'),
    fromAddr: text('from_addr'),
    status: text('status').notNull(),
    providerMessageId: text('provider_message_id'),
    senderName: text('sender_name'),
    errorMessage: text('error_message'),
  },
  (t) => ({
    requestedIdx: index('mail_outbound_log_requested_idx').on(t.requestedAt),
    templateIdx: index('mail_outbound_log_template_idx').on(t.template),
    statusIdx: index('mail_outbound_log_status_idx').on(t.status),
    statusCheck: check(
      'mail_outbound_log_status_check',
      sql`status IN ('queued','sent','failed','invalid_request')`,
    ),
  }),
)

export const OUTBOUND_STATUSES = ['queued', 'sent', 'failed', 'invalid_request'] as const
export type OutboundStatus = (typeof OUTBOUND_STATUSES)[number]

export const schema = { mailbox, mail, mailAttachment, mailInboundLog, mailOutboundLog }
export type Schema = typeof schema

export type MailboxRow = typeof mailbox.$inferSelect
export type MailRow = typeof mail.$inferSelect
export type MailAttachmentRow = typeof mailAttachment.$inferSelect
export type MailInboundLogRow = typeof mailInboundLog.$inferSelect
export type MailOutboundLogRow = typeof mailOutboundLog.$inferSelect

/** JMAP well-known mailbox roles, in display order. */
export const WELL_KNOWN_ROLES = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk'] as const
export type WellKnownRole = (typeof WELL_KNOWN_ROLES)[number]

/** Parsed address pair used inside JSON-encoded address columns. */
export type AddressEntry = { name?: string; mail: string }
