export { identityRouter } from './router'
export { adminIdentityRouter } from './router/admin'
export { humansRouter, type HumanRouterVars } from './router/humans'
export { registerRouter, type RegisterRouterVars } from './router/register'
export { createHumanService, HumanError, type Notifier } from './service/human'
export {
  createApiKeyService,
  ApiKeyError,
  API_KEY_PREFIX,
  type ApiKeyService,
  type IssuedApiKey,
  type ResolvedApiKey,
} from './service/api_key'
export {
  createRegisterService,
  RegisterError,
  type RegisterService,
  type RegisterInput,
  type RegisterResult,
  type Ed25519Jwk,
  type Ed25519JwkPrivate,
} from './service/register'
export { schema, type Schema, type Db } from './db'
export type {
  PrincipalRow,
  TenantRow,
  HumanRow,
  HumanEmailVerificationRow,
  AgentRow,
  AgentKeyRow,
  HumanApiKeyRow,
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
