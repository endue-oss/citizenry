-- Enforce "one active API-Key per human" (RFC-0004).
--
-- Step 1: data cleanup. For each owner with multiple active keys,
-- keep the most recently created one and mark the rest revoked.
-- Idempotent — re-running selects the same set (created_at ties are
-- broken by api_key_id lexicographically via the ROWID alias).
--
-- Step 2: partial unique index. Now that there is at most one active
-- key per owner, the DB enforces the invariant going forward.

-- ── Cleanup ──────────────────────────────────────────────────────
UPDATE human_api_key
   SET status = 'revoked',
       revoked_at = unixepoch() * 1000
 WHERE status = 'active'
   AND api_key_id NOT IN (
     SELECT api_key_id
       FROM (
         SELECT api_key_id,
                ROW_NUMBER() OVER (
                  PARTITION BY owner_human_principal_id
                  ORDER BY created_at DESC, api_key_id DESC
                ) AS rn
           FROM human_api_key
          WHERE status = 'active'
       )
      WHERE rn = 1
   );

-- ── Constraint ───────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS human_api_key_one_active_per_owner
    ON human_api_key (owner_human_principal_id)
    WHERE status = 'active';
