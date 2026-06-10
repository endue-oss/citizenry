-- 0015_agent_key_rotated_at
--
-- Key rotation (POST /v1/agent/me/rotate-key) stamps the moment the old
-- key left `active`. Bearer-JWT verification keeps accepting a rotated
-- key only while `rotated_at + grace window` lies in the future, which
-- implements the spec's `rotated -> revoked (after grace period)`
-- transition lazily at verify time — no cron required.
--
-- Rows rotated before this column existed stay NULL and are treated as
-- past the window (fail closed). No such rows exist in practice: the
-- rotate-key endpoint ships in the same change set.

ALTER TABLE agent_key ADD COLUMN rotated_at INTEGER;
