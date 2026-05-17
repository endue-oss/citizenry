export { emailRouter, type EmailRouterVars } from './router'
export { schema, type Schema, type Db } from './db'
export type {
  MailboxRow,
  EmailRow,
  EmailAttachmentRow,
  AddressEntry,
  WellKnownRole,
} from './db/schema'
export { WELL_KNOWN_ROLES } from './db/schema'
export { ID_PREFIX, type IdKind } from './ids'
export {
  ensureDefaultMailboxes,
  listMailboxes,
  listEmails,
  getEmail,
  storeInbound,
  sendEmail,
  type EmailSender,
  type OutboundMessage,
  type InboundEmail,
  type IdMinter,
} from './service'
