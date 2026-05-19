-- RFC-0002 phase 1: introduce the `realm` table and attach every
-- existing tenant to a default `primary` realm.
--
-- Phase 1 deliberately does NOT:
--   - tighten `tenant.realm_id` to NOT NULL (application-level
--     invariant for now; tightened in a later migration after every
--     adopter chooses their realm layout),
--   - per-realm pepper / signing-key / audit-stream namespacing,
--   - cross-realm authorization checks at the API layer.
--
-- See RFC-0002 for the full target shape.

CREATE TABLE IF NOT EXISTS realm (
    realm_id     TEXT    NOT NULL,
    slug         TEXT    NOT NULL,
    display_name TEXT,
    status       TEXT    NOT NULL DEFAULT 'active',
    created_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT realm_pkey PRIMARY KEY (realm_id),
    CONSTRAINT realm_slug_uniq UNIQUE (slug),
    CONSTRAINT realm_status_check CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE INDEX IF NOT EXISTS realm_status_idx ON realm (status);

-- Seed the default realm so existing tenants have somewhere to land.
INSERT OR IGNORE INTO realm (realm_id, slug, display_name)
VALUES ('rlm_0000000000000000000PR1MARY', 'primary', 'Default realm');

-- Add tenant.realm_id (nullable for now; backfilled below).
ALTER TABLE tenant ADD COLUMN realm_id TEXT
    REFERENCES realm (realm_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS tenant_realm_id_idx ON tenant (realm_id);

UPDATE tenant
   SET realm_id = 'rlm_0000000000000000000PR1MARY'
 WHERE realm_id IS NULL;
