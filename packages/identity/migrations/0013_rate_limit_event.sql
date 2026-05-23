-- Rate-limit counter table backing the per-email + per-IP throttling
-- on the unauth humans surface (RFC-0004). Sliding-window via
-- `count(*) WHERE ts > now - <window>`; cleanup is opportunistic on
-- each insert (rows older than the day window are deleted).
--
-- Caps (from packages/identity/src/service/rate_limit.ts):
--   PER_MINUTE_CAP = 2
--   PER_DAY_CAP    = 15
-- per (bucket_kind, bucket_value, scope) tuple.

CREATE TABLE IF NOT EXISTS rate_limit_event (
    id           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    bucket_kind  TEXT    NOT NULL,
    bucket_value TEXT    NOT NULL,
    scope        TEXT    NOT NULL,
    ts           INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT rate_limit_event_kind_check
        CHECK (bucket_kind IN ('email', 'ip'))
);

CREATE INDEX IF NOT EXISTS rate_limit_event_lookup_idx
    ON rate_limit_event (bucket_kind, bucket_value, scope, ts);

CREATE INDEX IF NOT EXISTS rate_limit_event_ts_idx
    ON rate_limit_event (ts);
