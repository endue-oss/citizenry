-- config / citizenry — D1 (SQLite) initial schema.
--
-- A small key/value store used as the runtime control plane for the
-- citizenry deployment. Writes go through admin-api → api `/_admin/*`;
-- reads come from packages/identity and packages/mail (via a
-- colo-local TTL cache layered on top of packages/config).
--
-- Conventions:
--   - `config_key` is the natural primary key. Dot-separated namespace
--     by convention (e.g. `mail.provider`, `identity.signing.kid`).
--   - `config_value` is a JSON-encoded scalar/object. The reader parses
--     and the writer stringifies; the column is opaque to D1.
--   - `updated_at` is INTEGER ms since epoch (unixepoch() * 1000),
--     matching the rest of the schema.
--   - `updated_by` records the principal that performed the write —
--     typically `hu_<ULID>` from the admin-api request, or `system`
--     for bootstrap writes from CI.

CREATE TABLE IF NOT EXISTS config (
    config_key   TEXT    NOT NULL,
    config_value TEXT    NOT NULL,
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_by   TEXT,

    CONSTRAINT config_pkey PRIMARY KEY (config_key)
);

CREATE INDEX IF NOT EXISTS config_updated_at_idx ON config (updated_at);
