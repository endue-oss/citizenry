export { mailRouter, type MailRouterVars } from './router'
export { MAIL, MailError } from './errors'
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
  recordInboundLog,
  sendMail,
  type MailSender,
  type OutboundMessage,
  type InboundMail,
  type IdMinter,
  type StoreInboundResult,
} from './service'
export {
  processNotify,
  type NotifyRequest,
  type NotifyResult,
  type NotifyDeps,
} from './service/notify'
export {
  renderTemplate,
  isKnownTemplate,
  KNOWN_TEMPLATES,
  type TemplateKey,
  type TemplatePayload,
  type RenderedTemplate,
  type HumanVerificationContext,
} from './templates'
export type {
  InboundDisposition,
  MailInboundLogRow,
  OutboundStatus,
  MailOutboundLogRow,
} from './db/schema'
export { INBOUND_DISPOSITIONS, OUTBOUND_STATUSES } from './db/schema'
