export { mailRouter, type MailRouterVars } from './router'
export { schema, type Schema, type Db } from './db'
export type {
  MailboxRow,
  MailRow,
  MailAttachmentRow,
  AddressEntry,
  WellKnownRole,
} from './db/schema'
export { WELL_KNOWN_ROLES } from './db/schema'
export { ID_PREFIX, type IdKind } from './ids'
export {
  ensureDefaultMailboxes,
  listMailboxes,
  listMails,
  getMail,
  storeInbound,
  sendMail,
  type MailSender,
  type OutboundMessage,
  type InboundMail,
  type IdMinter,
} from './service'
