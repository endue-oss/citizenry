-- identity / citizenry — switch admin auth to config-backed plaintext password.
--
-- admin_account (PBKDF2 hash + salt) is replaced by a single row in the
-- `citizenry-config-db` config table under key 'admin.password'. The
-- value is the plaintext password — read by admin-api on login and
-- compared in constant time. Delivery to the operator is via
-- `wrangler d1 execute citizenry-config-db ...` (their existing
-- Cloudflare-authenticated channel), so no plaintext ever crosses CI
-- logs or workflow artifacts.
--
-- admin_refresh_token loses its FK to admin_account (the latter is
-- gone). SQLite cannot drop a single FK in-place; the standard recipe
-- is drop + recreate. Existing rows are wiped, which is acceptable
-- because the admin auth domain is being re-bootstrapped — all sessions
-- would have to re-login anyway.

DROP TABLE IF EXISTS admin_refresh_token;
DROP TABLE IF EXISTS admin_account;

CREATE TABLE admin_refresh_token (
    admin_refresh_token_id  TEXT    NOT NULL,
    token_hash              BLOB    NOT NULL,
    admin_id                TEXT    NOT NULL,
    expires_at              INTEGER NOT NULL,
    revoked_at              INTEGER,
    replaced_by             TEXT,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT admin_refresh_token_pkey      PRIMARY KEY (admin_refresh_token_id),
    CONSTRAINT admin_refresh_token_hash_uniq UNIQUE (token_hash),
    CONSTRAINT admin_refresh_token_replaced_by_fk
        FOREIGN KEY (replaced_by) REFERENCES admin_refresh_token (admin_refresh_token_id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS admin_refresh_token_admin_id_idx
    ON admin_refresh_token (admin_id);
CREATE INDEX IF NOT EXISTS admin_refresh_token_expires_at_idx
    ON admin_refresh_token (expires_at);
