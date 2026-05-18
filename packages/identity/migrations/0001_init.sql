-- identity / citizenry — D1 (SQLite) initial schema
--
-- Conventions:
--   - singular table names, snake_case
--   - TEXT for IDs (ULID prefixed) — no varchar length constraint
--   - INTEGER (unixepoch * 1000) for timestamps — drizzle mode: 'timestamp_ms'
--   - BLOB for raw binary (Ed25519 32B, SHA-256 32B)
--   - TEXT(json) for metadata — drizzle mode: 'json'
--   - naming: <table>_pkey / <table>_<col>_uniq / <table>_<col>_check / <table>_<col>_idx


-- ── principal ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS principal (
    principal_id    TEXT    NOT NULL,
    kind            TEXT    NOT NULL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT principal_pkey PRIMARY KEY (principal_id)
);

CREATE INDEX IF NOT EXISTS principal_kind_idx ON principal (kind);


-- ── tenant ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant (
    tenant_id           TEXT    NOT NULL,
    slug                TEXT    NOT NULL,
    display_name        TEXT,
    status              TEXT    NOT NULL DEFAULT 'pending',
    kind                TEXT    NOT NULL DEFAULT 'local',
    federation_peer_id  TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT tenant_pkey PRIMARY KEY (tenant_id),
    CONSTRAINT tenant_slug_uniq UNIQUE (slug),
    CONSTRAINT tenant_kind_check CHECK (kind IN ('local', 'federated'))
);

CREATE INDEX IF NOT EXISTS tenant_status_idx ON tenant (status);
CREATE INDEX IF NOT EXISTS tenant_kind_idx ON tenant (kind);


-- ── federation_peer ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS federation_peer (
    federation_peer_id  TEXT    NOT NULL,
    issuer              TEXT    NOT NULL,
    instance_id         TEXT,
    display_name        TEXT,
    state               TEXT    NOT NULL DEFAULT 'invited',
    protocol_version    INTEGER NOT NULL DEFAULT 1,
    peer_metadata       TEXT    NOT NULL DEFAULT '{}',
    jwks                TEXT    NOT NULL DEFAULT '{}',
    jwks_cached_at      INTEGER,
    pending_nonce       TEXT,
    pending_nonce_exp   INTEGER,
    tenant_id           TEXT,
    trusted_at          INTEGER,
    suspended_at        INTEGER,
    revoked_at          INTEGER,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT federation_peer_pkey PRIMARY KEY (federation_peer_id),
    CONSTRAINT federation_peer_issuer_uniq UNIQUE (issuer),
    CONSTRAINT federation_peer_tenant_id_uniq UNIQUE (tenant_id),
    CONSTRAINT federation_peer_state_check
        CHECK (state IN ('invited', 'pending', 'trusted', 'suspended', 'revoked'))
);

CREATE INDEX IF NOT EXISTS federation_peer_state_idx ON federation_peer (state);
CREATE INDEX IF NOT EXISTS federation_peer_jwks_cached_at_idx ON federation_peer (jwks_cached_at);


-- ── tenant_principal_membership ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_principal_membership (
    tenant_id     TEXT    NOT NULL,
    principal_id  TEXT    NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT tenant_principal_membership_pkey PRIMARY KEY (tenant_id, principal_id),
    CONSTRAINT tenant_principal_membership_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id) ON DELETE CASCADE,
    CONSTRAINT tenant_principal_membership_principal_fk
        FOREIGN KEY (principal_id) REFERENCES principal(principal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_principal_membership_principal_id_idx
    ON tenant_principal_membership (principal_id);


-- ── human ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS human (
    principal_id  TEXT    NOT NULL,
    mail          TEXT    NOT NULL,
    display_name  TEXT,
    status        TEXT    NOT NULL DEFAULT 'active',
    created_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at    INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT human_pkey PRIMARY KEY (principal_id),
    CONSTRAINT human_mail_uniq UNIQUE (mail),
    CONSTRAINT human_principal_fk
        FOREIGN KEY (principal_id) REFERENCES principal(principal_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS human_status_idx ON human (status);


-- ── agent ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent (
    principal_id              TEXT    NOT NULL,
    slug                      TEXT    NOT NULL,
    display_name              TEXT,
    status                    TEXT    NOT NULL DEFAULT 'active',
    owner_human_principal_id  TEXT    NOT NULL,
    created_at                INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at                INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT agent_pkey PRIMARY KEY (principal_id),
    CONSTRAINT agent_slug_uniq UNIQUE (slug),
    CONSTRAINT agent_principal_fk
        FOREIGN KEY (principal_id) REFERENCES principal(principal_id) ON DELETE CASCADE,
    CONSTRAINT agent_owner_human_fk
        FOREIGN KEY (owner_human_principal_id) REFERENCES human(principal_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS agent_owner_human_principal_id_idx ON agent (owner_human_principal_id);
CREATE INDEX IF NOT EXISTS agent_status_idx ON agent (status);


-- ── agent_key ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_key (
    id          INTEGER NOT NULL,
    agent_id    TEXT    NOT NULL,
    kid         TEXT    NOT NULL,
    public_key  BLOB    NOT NULL,
    algorithm   TEXT    NOT NULL DEFAULT 'EdDSA',
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at  INTEGER,

    CONSTRAINT agent_key_pkey PRIMARY KEY (id AUTOINCREMENT),
    CONSTRAINT agent_key_kid_uniq UNIQUE (kid),
    CONSTRAINT agent_key_agent_fk
        FOREIGN KEY (agent_id) REFERENCES agent(principal_id) ON DELETE CASCADE,
    CONSTRAINT agent_key_algorithm_check CHECK (algorithm IN ('EdDSA')),
    CONSTRAINT agent_key_status_check CHECK (status IN ('active', 'rotated', 'revoked'))
);

CREATE INDEX IF NOT EXISTS agent_key_agent_id_idx ON agent_key (agent_id);
CREATE INDEX IF NOT EXISTS agent_key_status_idx ON agent_key (status);


-- ── enrollment_token ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_token (
    enrollment_token_id       TEXT    NOT NULL,
    token_hash                BLOB    NOT NULL,
    owner_human_principal_id  TEXT    NOT NULL,
    tenant_id                 TEXT    NOT NULL,
    uses_total                INTEGER NOT NULL,
    uses_left                 INTEGER NOT NULL,
    allow_keygen              INTEGER NOT NULL DEFAULT 0,
    expires_at                INTEGER NOT NULL,
    revoked_at                INTEGER,
    last_used_at              INTEGER,
    created_at                INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    created_by                TEXT    NOT NULL DEFAULT 'service-psk',

    CONSTRAINT enrollment_token_pkey PRIMARY KEY (enrollment_token_id),
    CONSTRAINT enrollment_token_token_hash_uniq UNIQUE (token_hash),
    CONSTRAINT enrollment_token_owner_human_fk
        FOREIGN KEY (owner_human_principal_id) REFERENCES human(principal_id) ON DELETE RESTRICT,
    CONSTRAINT enrollment_token_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id) ON DELETE RESTRICT,
    CONSTRAINT enrollment_token_uses_nonneg CHECK (uses_left >= 0),
    CONSTRAINT enrollment_token_uses_ordered CHECK (uses_left <= uses_total),
    CONSTRAINT enrollment_token_uses_positive CHECK (uses_total > 0)
);

CREATE INDEX IF NOT EXISTS enrollment_token_owner_human_principal_id_idx
    ON enrollment_token (owner_human_principal_id);
CREATE INDEX IF NOT EXISTS enrollment_token_tenant_id_idx
    ON enrollment_token (tenant_id);


-- ── jti_replay ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jti_replay (
    jti          TEXT    NOT NULL,
    expires_at   INTEGER NOT NULL,
    inserted_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT jti_replay_pkey PRIMARY KEY (jti)
);

CREATE INDEX IF NOT EXISTS jti_replay_expires_idx ON jti_replay (expires_at);


-- ── audit_log ──────────────────────────────────────────────────────
-- INSERT-only, no FKs (retained permanently after entity deletion).
CREATE TABLE IF NOT EXISTS audit_log (
    audit_log_id        TEXT    NOT NULL,
    actor_principal_id  TEXT,
    action              TEXT    NOT NULL,
    target_id           TEXT,
    outcome             TEXT    NOT NULL DEFAULT 'success',
    payload             TEXT    NOT NULL DEFAULT '{}',
    created_at          INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT audit_log_pkey PRIMARY KEY (audit_log_id)
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_principal_id_idx ON audit_log (actor_principal_id);
CREATE INDEX IF NOT EXISTS audit_log_target_id_idx ON audit_log (target_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);


-- ── _config ────────────────────────────────────────────────────────
-- Source of truth for instance secrets that are auto-generated at deploy
-- time and preserved for the life of the database. Worker secrets are
-- populated from this table; runtime code reads from the secret bindings.
--
-- Keys:
--   enrollment_pepper  — pepper for `apps/api` ENROLLMENT_PEPPER
--   service_key        — PSK shared by `apps/api` and `apps/admin-api`
--                        for X-Service-Key authentication
--
-- Inspect:
--   wrangler d1 execute citizenry-identity --remote \
--     --command="SELECT key, value FROM _config;"
--   (or open Cloudflare Dashboard → D1 → citizenry-identity → Console.)
--
-- Rotate:
--   DELETE FROM _config WHERE key='...';
--   The next deploy generates a fresh value and re-pushes it.
CREATE TABLE IF NOT EXISTS _config (
    key        TEXT    NOT NULL,
    value      TEXT    NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT _config_pkey PRIMARY KEY (key)
);
