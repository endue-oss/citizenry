-- Enforce "one tenant per principal" at the schema level.
--
-- The original tenant_principal_membership table was modelled M:N
-- (PK = (tenant_id, principal_id)) — the schema permitted a principal
-- to belong to many tenants, but the doctrine + router code only ever
-- inserted one row per principal at registration. This migration
-- promotes the doctrine into a constraint: at most one membership row
-- per principal_id.
--
-- This contradicts the Keycloak-Organizations model RFC-0002 grows
-- toward (where one user is naturally a member of many organizations
-- inside a realm). The trade-off is intentional for the *current*
-- product surface, where an agent's tenant is its hard authorization
-- boundary; if RFC-0002 phase 2 needs to relax this, drop this index
-- in a follow-up migration.
--
-- SQLite cannot ALTER a primary key in place. We add a UNIQUE index on
-- principal_id alone, which is sufficient since the PK already implies
-- uniqueness on (tenant_id, principal_id).

CREATE UNIQUE INDEX IF NOT EXISTS tenant_principal_membership_principal_uniq
    ON tenant_principal_membership (principal_id);
