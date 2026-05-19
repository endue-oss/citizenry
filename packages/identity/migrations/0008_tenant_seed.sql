-- Seed the three well-known tenants the platform ships with. Tenant
-- IDs use deterministic mnemonic ULIDs so adopters can reproduce the
-- seeds in staging/prod and federation peers reference stable values.
--
-- IDs satisfy the `tn_[0-9A-HJKMNP-TV-Z]{26}` scalar (Crockford Base32
-- excludes I/L/O/U), so "ENDUE" becomes "NDVE", "AI" becomes "A1", and
-- "SPACE" becomes "5PCE".
--
-- Slugs are operator-visible; tenant_ids are opaque FKs from
-- enrollment_token.tenant_id and tenant_principal_membership.tenant_id.
-- Idempotent — re-running the migration is a no-op when rows exist.
--
-- See RFC-0002 for the realm layer this tenant set will live under.

INSERT OR IGNORE INTO tenant (tenant_id, slug, display_name, status, kind)
VALUES
    ('tn_00000000000000000000NDVEA1', 'endue.ai',    'Endue operator console', 'active', 'local'),
    ('tn_000000000000000000NDVE5PCE', 'endue.space', 'Endue social activity',  'active', 'local'),
    ('tn_00000000000000000000PVB11C', 'public',      'Public self-hosters',    'active', 'local');
