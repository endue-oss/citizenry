// email / citizenry — D1 (SQLite) schema.
//
// Conventions:
//   - account_id == agent.principal_id (the JWT 'sub'). One email account per agent.
//   - All timestamps stored as INTEGER ms (unixepoch() * 1000).
//   - Address lists serialized as JSON arrays of `{ name?, email }`.
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
    totalEmails: integer('total_emails').notNull().default(0),
    unreadEmails: integer('unread_emails').notNull().default(0),
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

// ── email ──────────────────────────────────────────────────
// One row per message. `direction` distinguishes inbound (received via the
// Email Worker pipeline) from outbound (sent via POST /emails). Both share
// the same shape so list/get endpoints don't branch.
export const email = sqliteTable(
  'email',
  {
    emailId: text('email_id').primaryKey(),
    accountId: text('account_id').notNull(),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailbox.mailboxId, { onDelete: 'cascade' }),

    /** thr_<ULID> — bucketed by Message-ID hash or References chain. */
    threadId: text('thread_id').notNull(),
    /** RFC 5322 Message-ID — may be absent on malformed inbound email. */
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
    /** Each is a JSON array of `{ name?: string; email: string }`. */
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
    accountIdx: index('email_account_idx').on(t.accountId),
    mailboxReceivedIdx: index('email_mailbox_received_idx').on(t.mailboxId, t.receivedAt),
    threadIdx: index('email_thread_idx').on(t.accountId, t.threadId),
    messageIdIdx: index('email_message_id_idx').on(t.messageId),
    directionCheck: check('email_direction_check', sql`direction IN ('inbound','outbound')`),
    deliveryStatusCheck: check(
      'email_delivery_status_check',
      sql`delivery_status IN ('received','queued','sent','failed')`,
    ),
  }),
)

// ── email_attachment ───────────────────────────────────────
// Per-message attachment metadata + raw bytes. D1 BLOB is bounded by row
// size; large attachments are out of scope for v1 (move to R2 later).
export const emailAttachment = sqliteTable(
  'email_attachment',
  {
    attachmentId: text('attachment_id').primaryKey(),
    emailId: text('email_id')
      .notNull()
      .references(() => email.emailId, { onDelete: 'cascade' }),
    filename: text('filename'),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Content-ID for inline parts (e.g. `<image001@example>`). */
    cid: text('cid'),
    inline: integer('inline').notNull().default(0),
    blob: bytes('blob').notNull(),
  },
  (t) => ({
    emailIdx: index('email_attachment_email_idx').on(t.emailId),
  }),
)

export const schema = { mailbox, email, emailAttachment }
export type Schema = typeof schema

export type MailboxRow = typeof mailbox.$inferSelect
export type EmailRow = typeof email.$inferSelect
export type EmailAttachmentRow = typeof emailAttachment.$inferSelect

/** JMAP well-known mailbox roles, in display order. */
export const WELL_KNOWN_ROLES = ['inbox', 'sent', 'drafts', 'archive', 'trash', 'junk'] as const
export type WellKnownRole = (typeof WELL_KNOWN_ROLES)[number]

/** Parsed address pair used inside JSON-encoded address columns. */
export type AddressEntry = { name?: string; email: string }
