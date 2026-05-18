-- config / citizenry — reshape from (config_key PK) to (config_id PK + config_key UNIQUE).
--
-- Why: the public CRUD surface keys rows by `config_key`, but every
-- other domain table in this codebase carries an explicit `<table>_id`
-- ULID column. Adding it now keeps the storage layout consistent and
-- gives admin tooling a stable identifier independent of the
-- human-chosen key string.
--
-- This is a non-destructive migration when the table is empty:
-- 0001 was deployed but no production traffic has written to it yet,
-- so a drop-and-recreate is the safest path (SQLite cannot rewrite a
-- PRIMARY KEY in place). If a deployment has accumulated rows by the
-- time this lands, the operator must export them before applying and
-- re-import after.

DROP TABLE IF EXISTS config;

CREATE TABLE IF NOT EXISTS config (
    config_id    TEXT    NOT NULL,
    config_key   TEXT    NOT NULL,
    config_value TEXT    NOT NULL,
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_by   TEXT,

    CONSTRAINT config_pkey      PRIMARY KEY (config_id),
    CONSTRAINT config_key_uniq  UNIQUE (config_key)
);

CREATE INDEX IF NOT EXISTS config_updated_at_idx ON config (updated_at);
