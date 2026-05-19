import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  customType,
  index,
  primaryKey,
  check,
} from 'drizzle-orm/sqlite-core'

// raw bytes — e.g. Ed25519 32B, SHA-256 32B. D1 (SQLite) BLOB column.
// drizzle's default blob({mode:'buffer'}) forces Buffer, but the CF Workers runtime
// returns ArrayBuffer and our code handles Uint8Array — so we define this customType.
const bytes = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'BLOB'
  },
})

// ── principal ────────────────────────────────────────────────
// Common baseline for every citizen. ULID prefix aligns with kind:
//   ag_* (agent) / hu_* (human)
export const principal = sqliteTable(
  'principal',
  {
    principalId: text('principal_id').primaryKey(),
    kind: text('kind').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    kindIdx: index('principal_kind_idx').on(t.kind),
  }),
)

// ── tenant ───────────────────────────────────────────────────
// Domain entity that citizens belong to. 4-state lifecycle: pending → active ⇄ suspended → archived.
// kind: 'local' (default) | 'federated' (RFC-0001).
export const tenant = sqliteTable(
  'tenant',
  {
    tenantId: text('tenant_id').primaryKey(),
    slug: text('slug').notNull().unique('tenant_slug_uniq'),
    displayName: text('display_name'),
    status: text('status').default('pending').notNull(),
    kind: text('kind').default('local').notNull(),
    federationPeerId: text('federation_peer_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    statusIdx: index('tenant_status_idx').on(t.status),
    kindIdx: index('tenant_kind_idx').on(t.kind),
    kindChk: check('tenant_kind_check', sql`${t.kind} IN ('local', 'federated')`),
  }),
)

// ── federation_peer ──────────────────────────────────────────
// Local representation of another Citizenry instance (RFC-0001).
// peerMetadata / jwks are stored as TEXT(json mode) on D1 — the application handles them as objects.
export const federationPeer = sqliteTable(
  'federation_peer',
  {
    federationPeerId: text('federation_peer_id').primaryKey(),
    issuer: text('issuer').notNull().unique('federation_peer_issuer_uniq'),
    instanceId: text('instance_id'),
    displayName: text('display_name'),
    state: text('state').default('invited').notNull(),
    protocolVersion: integer('protocol_version').default(1).notNull(),
    peerMetadata: text('peer_metadata', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    jwks: text('jwks', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    jwksCachedAt: integer('jwks_cached_at', { mode: 'timestamp_ms' }),
    pendingNonce: text('pending_nonce'),
    pendingNonceExp: integer('pending_nonce_exp', { mode: 'timestamp_ms' }),
    tenantId: text('tenant_id').unique('federation_peer_tenant_id_uniq'),
    trustedAt: integer('trusted_at', { mode: 'timestamp_ms' }),
    suspendedAt: integer('suspended_at', { mode: 'timestamp_ms' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    stateIdx: index('federation_peer_state_idx').on(t.state),
    jwksCachedAtIdx: index('federation_peer_jwks_cached_at_idx').on(t.jwksCachedAt),
    stateChk: check(
      'federation_peer_state_check',
      sql`${t.state} IN ('invited', 'pending', 'trusted', 'suspended', 'revoked')`,
    ),
  }),
)

// ── tenant_principal_membership ──────────────────────────────
export const tenantPrincipalMembership = sqliteTable(
  'tenant_principal_membership',
  {
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.tenantId, { onDelete: 'cascade' }),
    principalId: text('principal_id')
      .notNull()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ name: 'tenant_principal_membership_pkey', columns: [t.tenantId, t.principalId] }),
    principalIdx: index('tenant_principal_membership_principal_id_idx').on(t.principalId),
  }),
)

// ── human ────────────────────────────────────────────────────
export const human = sqliteTable(
  'human',
  {
    principalId: text('principal_id')
      .primaryKey()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    email: text('email').notNull().unique('human_email_uniq'),
    displayName: text('display_name'),
    status: text('status').default('active').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    statusIdx: index('human_status_idx').on(t.status),
  }),
)

// ── human_email_verification ────────────────────────────────
// One outstanding verification row per principal (UNIQUE). The code
// is stored only as a peppered SHA-256; the 6-digit plaintext is
// dispatched by the mail Worker via `/_internal/notify`. See
// migration 0005 and ADR-2026-0005.
export const humanEmailVerification = sqliteTable(
  'human_email_verification',
  {
    verificationId: text('verification_id').primaryKey(),
    principalId: text('principal_id')
      .notNull()
      .unique('human_email_verification_principal_uniq')
      .references(() => human.principalId, { onDelete: 'cascade' }),
    codeHash: bytes('code_hash').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    verifiedAt: integer('verified_at', { mode: 'timestamp_ms' }),
    resendCount: integer('resend_count').notNull().default(0),
    lastSentAt: integer('last_sent_at', { mode: 'timestamp_ms' }).notNull(),
    nextResendAt: integer('next_resend_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    expiresIdx: index('human_email_verification_expires_idx').on(t.expiresAt),
  }),
)

// ── agent ────────────────────────────────────────────────────
export const agent = sqliteTable(
  'agent',
  {
    principalId: text('principal_id')
      .primaryKey()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique('agent_slug_uniq'),
    displayName: text('display_name'),
    status: text('status').default('active').notNull(),
    ownerHumanPrincipalId: text('owner_human_principal_id')
      .notNull()
      .references(() => human.principalId, { onDelete: 'restrict', onUpdate: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    ownerIdx: index('agent_owner_human_principal_id_idx').on(t.ownerHumanPrincipalId),
    statusIdx: index('agent_status_idx').on(t.status),
  }),
)

// ── agent_key ────────────────────────────────────────────────
// Key rotation chain. JWT verification accepts (active OR rotated).
// `id` is the SQLite ROWID alias — INTEGER PRIMARY KEY AUTOINCREMENT.
export const agentKey = sqliteTable(
  'agent_key',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agent.principalId, { onDelete: 'cascade' }),
    kid: text('kid').notNull().unique('agent_key_kid_uniq'),
    publicKey: bytes('public_key').notNull(),
    algorithm: text('algorithm').default('EdDSA').notNull(),
    status: text('status').default('active').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
  },
  (t) => ({
    agentIdx: index('agent_key_agent_id_idx').on(t.agentId),
    statusIdx: index('agent_key_status_idx').on(t.status),
    algChk: check('agent_key_algorithm_check', sql`${t.algorithm} IN ('EdDSA')`),
    statusChk: check('agent_key_status_check', sql`${t.status} IN ('active', 'rotated', 'revoked')`),
  }),
)

// ── enrollment_token ─────────────────────────────────────────
export const enrollmentToken = sqliteTable(
  'enrollment_token',
  {
    enrollmentTokenId: text('enrollment_token_id').primaryKey(),
    tokenHash: bytes('token_hash')
      .notNull()
      .unique('enrollment_token_token_hash_uniq'),
    ownerHumanPrincipalId: text('owner_human_principal_id')
      .notNull()
      .references(() => human.principalId, { onDelete: 'restrict' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenant.tenantId, { onDelete: 'restrict' }),
    usesTotal: integer('uses_total').notNull(),
    usesLeft: integer('uses_left').notNull(),
    allowKeygen: integer('allow_keygen', { mode: 'boolean' }).default(false).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdBy: text('created_by').default('service-psk').notNull(),
  },
  (t) => ({
    ownerIdx: index('enrollment_token_owner_human_principal_id_idx').on(t.ownerHumanPrincipalId),
    tenantIdx: index('enrollment_token_tenant_id_idx').on(t.tenantId),
    usesNonneg: check('enrollment_token_uses_nonneg', sql`${t.usesLeft} >= 0`),
    usesOrdered: check('enrollment_token_uses_ordered', sql`${t.usesLeft} <= ${t.usesTotal}`),
    usesPositive: check('enrollment_token_uses_positive', sql`${t.usesTotal} > 0`),
  }),
)

// ── jti_replay ───────────────────────────────────────────────
export const jtiReplay = sqliteTable(
  'jti_replay',
  {
    jti: text('jti').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    insertedAt: integer('inserted_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    expiresIdx: index('jti_replay_expires_idx').on(t.expiresAt),
  }),
)

// ── admin_refresh_token ──────────────────────────────────────
// Opaque refresh tokens for admin sessions. The server only stores a
// peppered SHA-256 hash. Rotation invalidates the previous row via
// `replaced_by` + `revoked_at`. Presentation of an already-replaced
// token is a replay signal.
//
// `admin_id` is a free-form string label — no FK. The credential
// itself lives in the config DB under key `admin.password` (see
// packages/config). Keeping admin_id as a plain TEXT column means
// adding more admin identities later is purely a config-shape change.
export const adminRefreshToken = sqliteTable(
  'admin_refresh_token',
  {
    adminRefreshTokenId: text('admin_refresh_token_id').primaryKey(),
    tokenHash: bytes('token_hash')
      .notNull()
      .unique('admin_refresh_token_hash_uniq'),
    adminId: text('admin_id').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    replacedBy: text('replaced_by'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    adminIdx: index('admin_refresh_token_admin_id_idx').on(t.adminId),
    expiresIdx: index('admin_refresh_token_expires_at_idx').on(t.expiresAt),
  }),
)

// ── audit_log ────────────────────────────────────────────────
// INSERT-only, no FKs (preserved permanently after entity deletion).
export const auditLog = sqliteTable(
  'audit_log',
  {
    auditLogId: text('audit_log_id').primaryKey(),
    actorPrincipalId: text('actor_principal_id'),
    action: text('action').notNull(),
    targetId: text('target_id'),
    outcome: text('outcome').default('success').notNull(),
    payload: text('payload', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    createdAtIdx: index('audit_log_created_at_idx').on(sql`${t.createdAt} DESC`),
    actorIdx: index('audit_log_actor_principal_id_idx').on(t.actorPrincipalId),
    targetIdx: index('audit_log_target_id_idx').on(t.targetId),
    actionIdx: index('audit_log_action_idx').on(t.action),
  }),
)

export const schema = {
  principal,
  tenant,
  tenantPrincipalMembership,
  human,
  humanEmailVerification,
  agent,
  agentKey,
  enrollmentToken,
  jtiReplay,
  auditLog,
  federationPeer,
  adminRefreshToken,
}
export type Schema = typeof schema

// Row types (insert / select)
export type PrincipalRow = typeof principal.$inferSelect
export type TenantRow = typeof tenant.$inferSelect
export type HumanRow = typeof human.$inferSelect
export type HumanEmailVerificationRow = typeof humanEmailVerification.$inferSelect
export type AgentRow = typeof agent.$inferSelect
export type AgentKeyRow = typeof agentKey.$inferSelect
export type EnrollmentTokenRow = typeof enrollmentToken.$inferSelect
export type AuditLogRow = typeof auditLog.$inferSelect
export type FederationPeerRow = typeof federationPeer.$inferSelect
export type AdminRefreshTokenRow = typeof adminRefreshToken.$inferSelect
