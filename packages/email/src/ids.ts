// ULID prefixes used in email. Stay aligned with packages/identity/src/ids.ts:
// the prefix identifies the entity kind without requiring a separate column.
//
// Generation lives at the call site (apps/email) so the package stays free
// of crypto/runtime deps.

export const ID_PREFIX = {
  /** Mailbox — folder owned by an agent. */
  MAILBOX: 'mb',
  /** Email — a single message (inbound or outbound). */
  EMAIL: 'eml',
  /** Email attachment — body parts addressed by Content-ID. */
  ATTACHMENT: 'att',
  /** Thread — bucket of related emails. */
  THREAD: 'thr',
} as const

export type IdKind = keyof typeof ID_PREFIX
