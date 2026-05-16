-- identity / citizenry — PostgreSQL initial schema
--
-- 컨벤션:
--   - schema 분리: identity
--   - 단수 테이블명
--   - TIMESTAMPTZ (UTC 강제)
--   - VARCHAR(255) for IDs (ULID prefixed)
--   - BYTEA for raw binary (Ed25519 32B, SHA-256 32B)
--   - JSONB for metadata
--   - 명명: <table>_pkey / <table>_<col>_uniq / <table>_<col>_check / <table>_<col>_idx


CREATE SCHEMA IF NOT EXISTS identity;


-- ── set_updated_at (공용 트리거 함수) ──────────────────────────────
-- 컨벤션: 트리거 사용 금지, 예외는 updated_at 자동 갱신만.
CREATE OR REPLACE FUNCTION identity.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ── principal ──────────────────────────────────────────────────────
-- 모든 시민의 공통 baseline.
-- agent 와 human 이 같은 ID 공간을 공유하는 polymorphic FK anchor.
CREATE TABLE IF NOT EXISTS identity.principal (
    principal_id    character varying(255) NOT NULL,
    kind            character varying(255) NOT NULL,
    created_at      timestamptz            NOT NULL DEFAULT NOW(),
    updated_at      timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT principal_pkey PRIMARY KEY (principal_id)
);

CREATE INDEX IF NOT EXISTS principal_kind_idx ON identity.principal (kind);

DROP TRIGGER IF EXISTS principal_set_updated_at ON identity.principal;
CREATE TRIGGER principal_set_updated_at
    BEFORE UPDATE ON identity.principal
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.principal              IS '모든 시민의 공통 baseline — agent / human 의 polymorphic FK anchor';
COMMENT ON COLUMN identity.principal.principal_id IS 'ULID prefix 로 종류 식별: ag_* (agent) / hu_* (human)';
COMMENT ON COLUMN identity.principal.kind         IS 'agent | human — extension 테이블 routing key';


-- ── tenant ─────────────────────────────────────────────────────────
-- 시민이 속하는 영역 entity — WHERE 차원.
-- 4-state lifecycle: pending → active ⇄ suspended → archived.
CREATE TABLE IF NOT EXISTS identity.tenant (
    tenant_id       character varying(255) NOT NULL,
    slug            character varying(255) NOT NULL,
    display_name    character varying(255),
    status          character varying(255) NOT NULL DEFAULT 'pending',
    created_at      timestamptz            NOT NULL DEFAULT NOW(),
    updated_at      timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT tenant_pkey      PRIMARY KEY (tenant_id),
    CONSTRAINT tenant_slug_uniq UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS tenant_status_idx ON identity.tenant (status);

DROP TRIGGER IF EXISTS tenant_set_updated_at ON identity.tenant;
CREATE TRIGGER tenant_set_updated_at
    BEFORE UPDATE ON identity.tenant
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.tenant              IS '시민이 속하는 영역 entity — WHERE 차원';
COMMENT ON COLUMN identity.tenant.tenant_id    IS 'tn_<ULID> — 영역 식별자';
COMMENT ON COLUMN identity.tenant.slug         IS 'human-readable 이름 (예: endue.ai, endue.space, public)';
COMMENT ON COLUMN identity.tenant.status       IS 'pending | active | suspended | archived';


-- ── tenant_principal_membership ────────────────────────────────────
-- principal ↔ tenant N:M 멤버십.
-- row 존재 = 활성 멤버, DELETE = 종료 (hard delete).
CREATE TABLE IF NOT EXISTS identity.tenant_principal_membership (
    tenant_id       character varying(255) NOT NULL,
    principal_id    character varying(255) NOT NULL,
    created_at      timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT tenant_principal_membership_pkey
        PRIMARY KEY (tenant_id, principal_id),
    CONSTRAINT tenant_principal_membership_tenant_id_fkey
        FOREIGN KEY (tenant_id)
        REFERENCES identity.tenant (tenant_id) ON DELETE CASCADE,
    CONSTRAINT tenant_principal_membership_principal_id_fkey
        FOREIGN KEY (principal_id)
        REFERENCES identity.principal (principal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_principal_membership_principal_id_idx
    ON identity.tenant_principal_membership (principal_id);

COMMENT ON TABLE identity.tenant_principal_membership
    IS 'principal ↔ tenant N:M 멤버십 — row 존재 = 활성, DELETE = 종료';


-- ── human ──────────────────────────────────────────────────────────
-- principal 의 kind='human' extension. 사람 시민.
CREATE TABLE IF NOT EXISTS identity.human (
    principal_id    character varying(255) NOT NULL,
    email           character varying(255) NOT NULL,
    display_name    character varying(255),
    status          character varying(255) NOT NULL DEFAULT 'active',
    created_at      timestamptz            NOT NULL DEFAULT NOW(),
    updated_at      timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT human_pkey            PRIMARY KEY (principal_id),
    CONSTRAINT human_email_uniq      UNIQUE (email),
    CONSTRAINT human_principal_fkey  FOREIGN KEY (principal_id)
        REFERENCES identity.principal (principal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS human_status_idx ON identity.human (status);

DROP TRIGGER IF EXISTS human_set_updated_at ON identity.human;
CREATE TRIGGER human_set_updated_at
    BEFORE UPDATE ON identity.human
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.human                IS '사람 시민 — principal 의 kind=human extension';
COMMENT ON COLUMN identity.human.principal_id   IS 'hu_<ULID> — principal.principal_id 와 동일';
COMMENT ON COLUMN identity.human.email          IS '부트스트랩 + 복구 채널 (UNIQUE — Sybil 비용 ↑)';
COMMENT ON COLUMN identity.human.status         IS 'active | revoked';


-- ── agent ──────────────────────────────────────────────────────────
-- principal 의 kind='agent' extension. AI 시민의 self-sovereign 표면.
-- 진실의 원천은 agent_key 체인.
CREATE TABLE IF NOT EXISTS identity.agent (
    principal_id                character varying(255) NOT NULL,
    slug                        character varying(255) NOT NULL,
    display_name                character varying(255),
    status                      character varying(255) NOT NULL DEFAULT 'active',
    owner_human_principal_id    character varying(255) NOT NULL,
    created_at                  timestamptz            NOT NULL DEFAULT NOW(),
    updated_at                  timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT agent_pkey                          PRIMARY KEY (principal_id),
    CONSTRAINT agent_slug_uniq                     UNIQUE (slug),
    CONSTRAINT agent_principal_fkey                FOREIGN KEY (principal_id)
        REFERENCES identity.principal (principal_id) ON DELETE CASCADE,
    CONSTRAINT agent_owner_human_principal_id_fkey FOREIGN KEY (owner_human_principal_id)
        REFERENCES identity.human (principal_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_owner_human_principal_id_idx ON identity.agent (owner_human_principal_id);
CREATE INDEX IF NOT EXISTS agent_status_idx                   ON identity.agent (status);

DROP TRIGGER IF EXISTS agent_set_updated_at ON identity.agent;
CREATE TRIGGER agent_set_updated_at
    BEFORE UPDATE ON identity.agent
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.agent                              IS 'AI 시민 — principal 의 kind=agent extension';
COMMENT ON COLUMN identity.agent.principal_id                 IS 'ag_<ULID> — principal.principal_id 와 동일';
COMMENT ON COLUMN identity.agent.slug                         IS 'URL-safe 공개 식별자';
COMMENT ON COLUMN identity.agent.status                       IS 'active | revoked';
COMMENT ON COLUMN identity.agent.owner_human_principal_id     IS '책임 chain 종착점 — kind=human 인 principal';


-- ── agent_key ──────────────────────────────────────────────────────
-- 키 회전 체인. 'active' 1개 + 'rotated' N개 + 'revoked' M개.
CREATE TABLE IF NOT EXISTS identity.agent_key (
    id              bigint                 GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    agent_id        character varying(255) NOT NULL,
    kid             character varying(255) NOT NULL,
    public_key      bytea                  NOT NULL,
    algorithm       character varying(255) NOT NULL DEFAULT 'EdDSA',
    status          character varying(255) NOT NULL DEFAULT 'active',
    created_at      timestamptz            NOT NULL DEFAULT NOW(),
    revoked_at      timestamptz,

    CONSTRAINT agent_key_pkey            PRIMARY KEY (id),
    CONSTRAINT agent_key_kid_uniq        UNIQUE (kid),
    CONSTRAINT agent_key_algorithm_check CHECK (algorithm IN ('EdDSA')),
    CONSTRAINT agent_key_status_check    CHECK (status IN ('active', 'rotated', 'revoked')),
    CONSTRAINT agent_key_agent_fkey      FOREIGN KEY (agent_id)
        REFERENCES identity.agent (principal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agent_key_agent_id_idx ON identity.agent_key (agent_id);
CREATE INDEX IF NOT EXISTS agent_key_status_idx   ON identity.agent_key (status);

COMMENT ON TABLE  identity.agent_key            IS '한 agent 의 Ed25519 키 회전 체인 — 모든 키 history 보관';
COMMENT ON COLUMN identity.agent_key.id         IS '내부 BIGINT IDENTITY';
COMMENT ON COLUMN identity.agent_key.agent_id   IS 'FK → agent.principal_id';
COMMENT ON COLUMN identity.agent_key.kid        IS 'kid_<ULID> — JWT header.kid 와 매칭';
COMMENT ON COLUMN identity.agent_key.public_key IS 'raw 32B Ed25519 — 서버는 공개키만';
COMMENT ON COLUMN identity.agent_key.algorithm  IS 'EdDSA 고정';
COMMENT ON COLUMN identity.agent_key.status     IS 'active | rotated | revoked';
COMMENT ON COLUMN identity.agent_key.revoked_at IS '폐기 시각';


-- ── enrollment_token ───────────────────────────────────────────────
-- 부트스트랩 등록 토큰. raw token 은 발급 응답 1회에만 노출,
-- DB 에는 token_hash = SHA-256(pepper || token) 만 저장.
CREATE TABLE IF NOT EXISTS identity.enrollment_token (
    enrollment_token_id         character varying(255) NOT NULL,
    token_hash                  bytea                  NOT NULL,
    owner_human_principal_id    character varying(255) NOT NULL,
    tenant_id                   character varying(255) NOT NULL,
    uses_total                  integer                NOT NULL,
    uses_left                   integer                NOT NULL,
    allow_keygen                boolean                NOT NULL DEFAULT false,
    expires_at                  timestamptz            NOT NULL,
    revoked_at                  timestamptz,
    last_used_at                timestamptz,
    created_at                  timestamptz            NOT NULL DEFAULT NOW(),
    created_by                  character varying(255) NOT NULL DEFAULT 'service-psk',

    CONSTRAINT enrollment_token_pkey                          PRIMARY KEY (enrollment_token_id),
    CONSTRAINT enrollment_token_token_hash_uniq               UNIQUE (token_hash),
    CONSTRAINT enrollment_token_uses_nonneg                   CHECK (uses_left  >= 0),
    CONSTRAINT enrollment_token_uses_ordered                  CHECK (uses_left  <= uses_total),
    CONSTRAINT enrollment_token_uses_positive                 CHECK (uses_total >  0),
    CONSTRAINT enrollment_token_owner_human_principal_id_fkey FOREIGN KEY (owner_human_principal_id)
        REFERENCES identity.human (principal_id) ON DELETE RESTRICT,
    CONSTRAINT enrollment_token_tenant_id_fkey                FOREIGN KEY (tenant_id)
        REFERENCES identity.tenant (tenant_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS enrollment_token_owner_human_principal_id_idx
    ON identity.enrollment_token (owner_human_principal_id);
CREATE INDEX IF NOT EXISTS enrollment_token_tenant_id_idx
    ON identity.enrollment_token (tenant_id);
-- 활성 토큰 만료 임박 lookup (revoked 제외)
CREATE INDEX IF NOT EXISTS enrollment_token_expires_at_idx
    ON identity.enrollment_token (expires_at)
    WHERE revoked_at IS NULL;

COMMENT ON TABLE  identity.enrollment_token                          IS '부트스트랩 등록 토큰 — peppered hash 만 보관';
COMMENT ON COLUMN identity.enrollment_token.enrollment_token_id      IS 'enr_<ULID>';
COMMENT ON COLUMN identity.enrollment_token.token_hash               IS 'SHA-256(pepper || raw_token)';
COMMENT ON COLUMN identity.enrollment_token.owner_human_principal_id IS 'FK → human.principal_id';
COMMENT ON COLUMN identity.enrollment_token.tenant_id                IS 'FK → tenant.tenant_id';
COMMENT ON COLUMN identity.enrollment_token.allow_keygen             IS 'true 면 register 의 server keygen 옵션 허용';


-- ── jti_replay ─────────────────────────────────────────────────────
-- JWS 1회성 보장. PRIMARY KEY 의 INSERT 충돌로 1회성 강제.
CREATE TABLE IF NOT EXISTS identity.jti_replay (
    jti             TEXT        NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    inserted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT jti_replay_pkey PRIMARY KEY (jti)
);

CREATE INDEX IF NOT EXISTS jti_replay_expires_idx ON identity.jti_replay (expires_at);


-- ── audit_log ──────────────────────────────────────────────────────
-- 누가 / 무엇을 / 대상 / 결과 / 언제. INSERT-only, FK 없음.
CREATE TABLE IF NOT EXISTS identity.audit_log (
    audit_log_id        character varying(255) NOT NULL,
    actor_principal_id  character varying(255),
    action              character varying(255) NOT NULL,
    target_id           character varying(255),
    outcome             character varying(255) NOT NULL DEFAULT 'success',
    payload             jsonb                  NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz            NOT NULL DEFAULT NOW(),

    CONSTRAINT audit_log_pkey PRIMARY KEY (audit_log_id)
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx         ON identity.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_principal_id_idx ON identity.audit_log (actor_principal_id);
CREATE INDEX IF NOT EXISTS audit_log_target_id_idx          ON identity.audit_log (target_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx             ON identity.audit_log (action);

COMMENT ON TABLE  identity.audit_log                    IS 'INSERT-only audit log';
COMMENT ON COLUMN identity.audit_log.audit_log_id       IS 'alg_<ULID>';
COMMENT ON COLUMN identity.audit_log.actor_principal_id IS '행위자 principal_id (NULL = 미인증 / 시스템)';
COMMENT ON COLUMN identity.audit_log.action             IS 'dot.notation (예: agent.register, human.signup, auth.failure)';
COMMENT ON COLUMN identity.audit_log.target_id          IS '대상 entity ID — ULID prefix 가 종류 표현';
COMMENT ON COLUMN identity.audit_log.outcome            IS 'success | failure | denied';
COMMENT ON COLUMN identity.audit_log.payload            IS '가변 evidence (IP/UA/reason/before-after/correlation_id/severity 등)';
