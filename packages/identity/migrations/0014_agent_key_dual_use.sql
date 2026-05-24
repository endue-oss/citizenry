-- 0014_agent_key_dual_use
--
-- Dual-key agents: each agent now holds a signing key (EdDSA / Ed25519,
-- use='sig') and an encryption key (X25519, use='enc', for vault
-- encrypt-to-agent key-agreement). The enc key is vouched for by the sig
-- key whose binding JWS signed its registration; `bound_to_kid` records it.
--
-- SQLite cannot ALTER a CHECK constraint in place, so the algorithm check
-- (previously `IN ('EdDSA')`) is widened by recreating the table.

PRAGMA foreign_keys=OFF;

CREATE TABLE agent_key_new (
    id          INTEGER NOT NULL,
    agent_id    TEXT    NOT NULL,
    kid         TEXT    NOT NULL,
    public_key  BLOB    NOT NULL,
    algorithm   TEXT    NOT NULL DEFAULT 'EdDSA',
    use         TEXT    NOT NULL DEFAULT 'sig',
    bound_to_kid TEXT,
    status      TEXT    NOT NULL DEFAULT 'active',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    revoked_at  INTEGER,

    CONSTRAINT agent_key_pkey PRIMARY KEY (id AUTOINCREMENT),
    CONSTRAINT agent_key_kid_uniq UNIQUE (kid),
    CONSTRAINT agent_key_agent_fk
        FOREIGN KEY (agent_id) REFERENCES agent(principal_id) ON DELETE CASCADE,
    CONSTRAINT agent_key_algorithm_check CHECK (algorithm IN ('EdDSA', 'X25519')),
    CONSTRAINT agent_key_use_check CHECK (use IN ('sig', 'enc')),
    CONSTRAINT agent_key_status_check CHECK (status IN ('active', 'rotated', 'revoked'))
);

-- Existing rows are all Ed25519 signing keys.
INSERT INTO agent_key_new (id, agent_id, kid, public_key, algorithm, use, bound_to_kid, status, created_at, revoked_at)
SELECT id, agent_id, kid, public_key, algorithm, 'sig', NULL, status, created_at, revoked_at
FROM agent_key;

DROP TABLE agent_key;
ALTER TABLE agent_key_new RENAME TO agent_key;

CREATE INDEX IF NOT EXISTS agent_key_agent_id_idx ON agent_key (agent_id);
CREATE INDEX IF NOT EXISTS agent_key_status_idx ON agent_key (status);
CREATE INDEX IF NOT EXISTS agent_key_use_idx ON agent_key (use);

PRAGMA foreign_keys=ON;
