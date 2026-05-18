export { identityRouter } from './router'
export { adminIdentityRouter } from './router/admin'
export { schema, type Schema, type Db } from './db'
export type {
  PrincipalRow,
  TenantRow,
  HumanRow,
  AgentRow,
  AgentKeyRow,
  EnrollmentTokenRow,
  AuditLogRow,
  FederationPeerRow,
  AdminRefreshTokenRow,
} from './db/schema'
export {
  createAdminAuthService,
  AdminAuthErrorResult,
  type AdminAuthService,
  type AdminAuthError,
  type AdminLoginResult,
  type AdminRefreshResult,
} from './service/admin_auth'
export { ID_PREFIX } from './ids'
export type {
  FederationPeerState,
  FederationPurpose,
  FederationPeerView,
  FederationHandshakePayload,
  PeerDiscoveryDocument,
} from './service/federation/types'
