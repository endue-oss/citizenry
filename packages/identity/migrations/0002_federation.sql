-- identity / citizenry — federation surface (RFC-0001)
--
-- 추가하는 객체:
--   * tenant.kind                   ('local' | 'federated')
--   * tenant.federation_peer_id     nullable FK → federation_peer
--   * tenant_kind_idx (kind filter 가속)
--   * federation_peer 테이블 + 인덱스 + 트리거


-- ── tenant — 확장 ──────────────────────────────────────────────────
-- 기존 row 는 자동으로 'local' 로 backfill.

ALTER TABLE identity.tenant
    ADD COLUMN IF NOT EXISTS kind               varchar(255) NOT NULL DEFAULT 'local',
    ADD COLUMN IF NOT EXISTS federation_peer_id varchar(255);

ALTER TABLE identity.tenant
    DROP CONSTRAINT IF EXISTS tenant_kind_check;

ALTER TABLE identity.tenant
    ADD CONSTRAINT tenant_kind_check
        CHECK (kind IN ('local', 'federated'));

CREATE INDEX IF NOT EXISTS tenant_kind_idx
    ON identity.tenant (kind);

COMMENT ON COLUMN identity.tenant.kind
    IS 'local | federated — federated 는 federation_peer 와 1:1 매핑';
COMMENT ON COLUMN identity.tenant.federation_peer_id
    IS 'kind=federated 일 때 FK → federation_peer.federation_peer_id (1:1)';


-- ── federation_peer ───────────────────────────────────────────────
-- 다른 Citizenry 인스턴스의 로컬 표현.
-- state machine 은 RFC-0001 §"State machine" 참조.

CREATE TABLE IF NOT EXISTS identity.federation_peer (
    federation_peer_id  varchar(255) NOT NULL,

    -- peer 의 issuer URL — `did:web:<issuer>` 의 host. 글로벌 unique.
    issuer              varchar(255) NOT NULL,

    -- peer 가 self-declare 한 안정 self-id. discovery 응답에서 수신.
    instance_id         varchar(255),

    display_name        varchar(255),

    state               varchar(255) NOT NULL DEFAULT 'invited',
    protocol_version    integer      NOT NULL DEFAULT 1,

    -- discovery 응답 원본 캐시 + 캐시 시각.
    peer_metadata       jsonb        NOT NULL DEFAULT '{}'::jsonb,
    jwks                jsonb        NOT NULL DEFAULT '{}'::jsonb,
    jwks_cached_at      timestamptz,

    -- in-flight 핸드셰이크 nonce + 만료 (10분).
    pending_nonce       varchar(255),
    pending_nonce_exp   timestamptz,

    -- federated tenant 와의 1:1. trusted 가 되면 tenant 자동 생성.
    tenant_id           varchar(255),

    trusted_at          timestamptz,
    suspended_at        timestamptz,
    revoked_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT NOW(),
    updated_at          timestamptz NOT NULL DEFAULT NOW(),

    CONSTRAINT federation_peer_pkey
        PRIMARY KEY (federation_peer_id),

    CONSTRAINT federation_peer_issuer_uniq
        UNIQUE (issuer),

    CONSTRAINT federation_peer_tenant_id_uniq
        UNIQUE (tenant_id),

    CONSTRAINT federation_peer_state_check
        CHECK (state IN ('invited', 'pending', 'trusted', 'suspended', 'revoked')),

    CONSTRAINT federation_peer_tenant_id_fkey
        FOREIGN KEY (tenant_id)
        REFERENCES identity.tenant (tenant_id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS federation_peer_state_idx
    ON identity.federation_peer (state);
CREATE INDEX IF NOT EXISTS federation_peer_jwks_cached_at_idx
    ON identity.federation_peer (jwks_cached_at);

DROP TRIGGER IF EXISTS federation_peer_set_updated_at ON identity.federation_peer;
CREATE TRIGGER federation_peer_set_updated_at
    BEFORE UPDATE ON identity.federation_peer
    FOR EACH ROW EXECUTE FUNCTION identity.set_updated_at();

COMMENT ON TABLE  identity.federation_peer
    IS '다른 Citizenry 인스턴스의 로컬 표현 — RFC-0001';
COMMENT ON COLUMN identity.federation_peer.federation_peer_id
    IS 'fdp_<ULID>';
COMMENT ON COLUMN identity.federation_peer.issuer
    IS 'peer issuer URL — `did:web:<host>` 의 host 부분과 동일';
COMMENT ON COLUMN identity.federation_peer.instance_id
    IS 'ci_<ULID> — peer 가 self-declare 한 안정 id (JWKS 회전과 무관)';
COMMENT ON COLUMN identity.federation_peer.state
    IS 'invited | pending | trusted | suspended | revoked';
COMMENT ON COLUMN identity.federation_peer.peer_metadata
    IS '/.well-known/citizenry-peer 응답 원본 캐시';
COMMENT ON COLUMN identity.federation_peer.jwks
    IS '캐시된 JWKS (verify 시 사용)';
COMMENT ON COLUMN identity.federation_peer.pending_nonce
    IS 'invite 후 confirm 까지 in-flight nonce';
COMMENT ON COLUMN identity.federation_peer.tenant_id
    IS 'trusted 시 materialize 된 federated tenant — 1:1';


-- ── tenant.federation_peer_id FK (federation_peer 생성 이후에 add) ─

ALTER TABLE identity.tenant
    DROP CONSTRAINT IF EXISTS tenant_federation_peer_id_fkey;

ALTER TABLE identity.tenant
    ADD CONSTRAINT tenant_federation_peer_id_fkey
    FOREIGN KEY (federation_peer_id)
    REFERENCES identity.federation_peer (federation_peer_id)
    ON DELETE SET NULL;
