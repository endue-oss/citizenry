export { identityRouter } from './router'
export { adminIdentityRouter } from './router/admin'
export { humansRouter, type HumanRouterVars } from './router/humans'
export { registerRouter, type RegisterRouterVars } from './router/register'
export {
  createHumanService,
  HumanError,
  DEFAULT_ALLOWED_EMAIL_DOMAINS,
  ALLOWED_EMAIL_DOMAINS_CONFIG_KEY,
  type Notifier,
} from './service/human'
export {
  createRateLimitService,
  PER_MINUTE_CAP,
  PER_DAY_CAP,
  type RateLimitService,
  type RateLimitScope,
  type RateLimitBucket,
  type RateLimitDecision,
} from './service/rate_limit'
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
  type X25519Jwk,
  type X25519JwkPrivate,
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
  RateLimitEventRow,
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
