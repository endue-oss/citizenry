-- identity / citizenry — admin authentication for apps/admin-api.
--
-- Two tables:
--   - admin_account         : credentials for the human operator that
--                             logs into admin-api (separate from the
--                             agent/human "citizen" model above).
--                             Single-row by design (admin_id PK), but
--                             nothing prevents adding more rows later.
--   - admin_refresh_token   : opaque refresh-token registry. Server
--                             stores `token_hash` (peppered SHA-256) and
--                             can only compare. Rotation is enforced by
--                             setting `replaced_by` and `revoked_at` on
--                             the previous row.
--
-- Password storage: PBKDF2-SHA-256, 200k iterations, 32B salt, 32B
-- output. Both the salt and the hash are BLOB columns. The Worker
-- derives bits via Web Crypto on every login attempt.

-- ── admin_account ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_account (
    admin_id        TEXT    NOT NULL,
    password_hash   BLOB    NOT NULL,
    password_salt   BLOB    NOT NULL,
    iterations      INTEGER NOT NULL DEFAULT 200000,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT admin_account_pkey PRIMARY KEY (admin_id),
    CONSTRAINT admin_account_iterations_check CHECK (iterations >= 100000)
);


-- ── admin_refresh_token ──────────────────────────────────────────────
-- A new row is inserted on every successful login or refresh. The
-- previous row's `replaced_by` is set to the new row's id, and its
-- `revoked_at` to the rotation time. A refresh-token presentation that
-- finds either `revoked_at IS NOT NULL` or an existing `replaced_by`
-- pointer is treated as a replay attempt — the caller must re-login.
CREATE TABLE IF NOT EXISTS admin_refresh_token (
    admin_refresh_token_id  TEXT    NOT NULL,
    token_hash              BLOB    NOT NULL,
    admin_id                TEXT    NOT NULL,
    expires_at              INTEGER NOT NULL,
    revoked_at              INTEGER,
    replaced_by             TEXT,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT admin_refresh_token_pkey      PRIMARY KEY (admin_refresh_token_id),
    CONSTRAINT admin_refresh_token_hash_uniq UNIQUE (token_hash),
    CONSTRAINT admin_refresh_token_admin_fk
        FOREIGN KEY (admin_id) REFERENCES admin_account (admin_id) ON DELETE CASCADE,
    CONSTRAINT admin_refresh_token_replaced_by_fk
        FOREIGN KEY (replaced_by) REFERENCES admin_refresh_token (admin_refresh_token_id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS admin_refresh_token_admin_id_idx
    ON admin_refresh_token (admin_id);
CREATE INDEX IF NOT EXISTS admin_refresh_token_expires_at_idx
    ON admin_refresh_token (expires_at);
