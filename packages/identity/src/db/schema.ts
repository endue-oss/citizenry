import { sql } from 'drizzle-orm'
import {
  pgSchema,
  varchar,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  customType,
  index,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core'

// BYTEA — public_key, token_hash (raw bytes; postgres-js → Uint8Array).
const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return 'bytea'
  },
})

export const identity = pgSchema('identity')

// ── principal ────────────────────────────────────────────────
// 모든 시민의 공통 baseline. ULID prefix 가 kind 와 정합:
//   ag_* (agent) / hu_* (human)
export const principal = identity.table(
  'principal',
  {
    principalId: varchar('principal_id', { length: 255 }).primaryKey(),
    kind: varchar('kind', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('principal_kind_idx').on(t.kind)],
)

// ── tenant ───────────────────────────────────────────────────
// 시민이 속하는 영역 entity (WHERE 차원).
// 4-state lifecycle: pending → active ⇄ suspended → archived.
export const tenant = identity.table(
  'tenant',
  {
    tenantId: varchar('tenant_id', { length: 255 }).primaryKey(),
    slug: varchar('slug', { length: 255 }).notNull().unique('tenant_slug_uniq'),
    displayName: varchar('display_name', { length: 255 }),
    status: varchar('status', { length: 255 }).default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('tenant_status_idx').on(t.status)],
)

// ── tenant_principal_membership ──────────────────────────────
// principal ↔ tenant N:M. row 존재 = 활성, DELETE = 종료.
export const tenantPrincipalMembership = identity.table(
  'tenant_principal_membership',
  {
    tenantId: varchar('tenant_id', { length: 255 })
      .notNull()
      .references(() => tenant.tenantId, { onDelete: 'cascade' }),
    principalId: varchar('principal_id', { length: 255 })
      .notNull()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ name: 'tenant_principal_membership_pkey', columns: [t.tenantId, t.principalId] }),
    index('tenant_principal_membership_principal_id_idx').on(t.principalId),
  ],
)

// ── human ────────────────────────────────────────────────────
// principal 의 kind='human' extension. 사람 시민.
export const human = identity.table(
  'human',
  {
    principalId: varchar('principal_id', { length: 255 })
      .primaryKey()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull().unique('human_email_uniq'),
    displayName: varchar('display_name', { length: 255 }),
    status: varchar('status', { length: 255 }).default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('human_status_idx').on(t.status)],
)

// ── agent ────────────────────────────────────────────────────
// principal 의 kind='agent' extension. AI 시민의 self-sovereign 표면.
// owner_human_principal_id 는 책임 chain 종착점.
export const agent = identity.table(
  'agent',
  {
    principalId: varchar('principal_id', { length: 255 })
      .primaryKey()
      .references(() => principal.principalId, { onDelete: 'cascade' }),
    slug: varchar('slug', { length: 255 }).notNull().unique('agent_slug_uniq'),
    displayName: varchar('display_name', { length: 255 }),
    status: varchar('status', { length: 255 }).default('active').notNull(),
    ownerHumanPrincipalId: varchar('owner_human_principal_id', { length: 255 })
      .notNull()
      .references(() => human.principalId, { onDelete: 'restrict', onUpdate: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('agent_owner_human_principal_id_idx').on(t.ownerHumanPrincipalId),
    index('agent_status_idx').on(t.status),
  ],
)

// ── agent_key ────────────────────────────────────────────────
// 키 회전 체인. JWT 검증은 (active OR rotated) 까지 허용.
export const agentKey = identity.table(
  'agent_key',
  {
    id: bigint('id', { mode: 'bigint' }).generatedByDefaultAsIdentity().primaryKey(),
    agentId: varchar('agent_id', { length: 255 })
      .notNull()
      .references(() => agent.principalId, { onDelete: 'cascade' }),
    kid: varchar('kid', { length: 255 }).notNull().unique('agent_key_kid_uniq'),
    publicKey: bytea('public_key').notNull(),
    algorithm: varchar('algorithm', { length: 255 }).default('EdDSA').notNull(),
    status: varchar('status', { length: 255 }).default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('agent_key_agent_id_idx').on(t.agentId),
    index('agent_key_status_idx').on(t.status),
    check('agent_key_algorithm_check', sql`${t.algorithm} IN ('EdDSA')`),
    check('agent_key_status_check', sql`${t.status} IN ('active', 'rotated', 'revoked')`),
  ],
)

// ── enrollment_token ─────────────────────────────────────────
// 부트스트랩 등록 토큰. raw token 은 응답 1회 노출, DB 에는 peppered hash 만.
export const enrollmentToken = identity.table(
  'enrollment_token',
  {
    enrollmentTokenId: varchar('enrollment_token_id', { length: 255 }).primaryKey(),
    tokenHash: bytea('token_hash').notNull().unique('enrollment_token_token_hash_uniq'),
    ownerHumanPrincipalId: varchar('owner_human_principal_id', { length: 255 })
      .notNull()
      .references(() => human.principalId, { onDelete: 'restrict' }),
    tenantId: varchar('tenant_id', { length: 255 })
      .notNull()
      .references(() => tenant.tenantId, { onDelete: 'restrict' }),
    usesTotal: integer('uses_total').notNull(),
    usesLeft: integer('uses_left').notNull(),
    allowKeygen: boolean('allow_keygen').default(false).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by', { length: 255 }).default('service-psk').notNull(),
  },
  (t) => [
    index('enrollment_token_owner_human_principal_id_idx').on(t.ownerHumanPrincipalId),
    index('enrollment_token_tenant_id_idx').on(t.tenantId),
    check('enrollment_token_uses_nonneg', sql`${t.usesLeft} >= 0`),
    check('enrollment_token_uses_ordered', sql`${t.usesLeft} <= ${t.usesTotal}`),
    check('enrollment_token_uses_positive', sql`${t.usesTotal} > 0`),
  ],
)

// ── jti_replay ───────────────────────────────────────────────
// JWS 1회성 보장. INSERT 충돌로 replay 차단.
export const jtiReplay = identity.table(
  'jti_replay',
  {
    jti: text('jti').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    insertedAt: timestamp('inserted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('jti_replay_expires_idx').on(t.expiresAt)],
)

// ── audit_log ────────────────────────────────────────────────
// INSERT-only, FK 없음 (entity 삭제 후 영구 보존).
export const auditLog = identity.table(
  'audit_log',
  {
    auditLogId: varchar('audit_log_id', { length: 255 }).primaryKey(),
    actorPrincipalId: varchar('actor_principal_id', { length: 255 }),
    action: varchar('action', { length: 255 }).notNull(),
    targetId: varchar('target_id', { length: 255 }),
    outcome: varchar('outcome', { length: 255 }).default('success').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_log_created_at_idx').on(sql`${t.createdAt} DESC`),
    index('audit_log_actor_principal_id_idx').on(t.actorPrincipalId),
    index('audit_log_target_id_idx').on(t.targetId),
    index('audit_log_action_idx').on(t.action),
  ],
)

export const schema = {
  principal,
  tenant,
  tenantPrincipalMembership,
  human,
  agent,
  agentKey,
  enrollmentToken,
  jtiReplay,
  auditLog,
}
export type Schema = typeof schema

// Row 타입 (insert / select)
export type PrincipalRow = typeof principal.$inferSelect
export type TenantRow = typeof tenant.$inferSelect
export type HumanRow = typeof human.$inferSelect
export type AgentRow = typeof agent.$inferSelect
export type AgentKeyRow = typeof agentKey.$inferSelect
export type EnrollmentTokenRow = typeof enrollmentToken.$inferSelect
export type AuditLogRow = typeof auditLog.$inferSelect
