-- Long-lived bearer credential for verified humans. Mirrors
-- enrollment_token's hash-only storage: `chk_<random>` is surfaced once
-- at issue, and the server keeps a peppered SHA-256 to authenticate
-- inbound requests. Replaces the X-Service-Key + eret_ Bearer auth
-- model on the public identity surface (enrollments, agent register).

CREATE TABLE IF NOT EXISTS human_api_key (
    api_key_id   TEXT    NOT NULL,
    token_hash   BLOB    NOT NULL,
    owner_human_principal_id TEXT NOT NULL,
    display_name TEXT,
    status       TEXT    NOT NULL DEFAULT 'active',

    expires_at   INTEGER,
    last_used_at INTEGER,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at   INTEGER,

    CONSTRAINT human_api_key_pkey PRIMARY KEY (api_key_id),
    CONSTRAINT human_api_key_token_hash_uniq UNIQUE (token_hash),
    CONSTRAINT human_api_key_owner_fk FOREIGN KEY (owner_human_principal_id)
        REFERENCES human (principal_id) ON DELETE CASCADE,
    CONSTRAINT human_api_key_status_check CHECK (status IN ('active', 'revoked'))
);

CREATE INDEX IF NOT EXISTS human_api_key_owner_idx
    ON human_api_key (owner_human_principal_id);

CREATE INDEX IF NOT EXISTS human_api_key_status_idx
    ON human_api_key (status);
