// ULID prefixes used in mail. Stay aligned with packages/identity/src/ids.ts:
// the prefix identifies the entity kind without requiring a separate column.
//
// Generation lives at the call site (apps/mail) so the package stays free
// of crypto/runtime deps.

export const ID_PREFIX = {
  /** Mailbox — folder owned by an agent. */
  MAILBOX: 'mb',
  /** Mail — a single message (inbound or outbound). */
  MAIL: 'mai',
  /** Mail attachment — body parts addressed by Content-ID. */
  ATTACHMENT: 'att',
  /** Thread — bucket of related mails. */
  THREAD: 'thr',
  /** Inbound audit-log row. */
  INBOUND_LOG: 'inl',
  /** Outbound audit-log row. */
  OUTBOUND_LOG: 'oul',
} as const

export type IdKind = keyof typeof ID_PREFIX
