-- mail / citizenry — outbound audit log.
--
-- Sibling of mail_inbound_log: every system-initiated send through
-- POST /_internal/notify writes one row here. Agent-initiated sends
-- (POST /mails with agent JWT) also flow through the same sender
-- pipeline; whether to log those here too is left for a follow-up —
-- this migration only commits the table shape.
--
-- See ADR-2026-0005 for the centralize-outbound-through-mail decision.

CREATE TABLE IF NOT EXISTS mail_outbound_log (
    outbound_log_id      TEXT    NOT NULL,
    requested_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    -- Calling Worker (`citizenry-api`, `citizenry-admin-api`, ...).
    -- Best-effort: derived from the X-Caller header when present,
    -- otherwise NULL.
    caller               TEXT,

    -- Template key the caller requested (e.g. `human_verification`).
    template             TEXT    NOT NULL,

    -- JSON array of `[{ "name": "...", "mail": "..." }, ...]`.
    to_addrs             TEXT    NOT NULL DEFAULT '[]',
    -- Sender envelope address used (may be the per-instance default).
    from_addr            TEXT,

    -- One of: 'queued' | 'sent' | 'failed' | 'invalid_request'.
    status               TEXT    NOT NULL,
    -- Provider message id when status='sent' and provider returns one.
    provider_message_id  TEXT,
    -- Sender chosen by pickSender at request time
    -- (`cloudflare` / `resend` / `aws-ses` / `log-only`).
    sender_name          TEXT,
    -- Failure detail when status='failed' or 'invalid_request'.
    error_message        TEXT,

    CONSTRAINT mail_outbound_log_pkey PRIMARY KEY (outbound_log_id),
    CONSTRAINT mail_outbound_log_status_check
        CHECK (status IN ('queued','sent','failed','invalid_request'))
);

CREATE INDEX IF NOT EXISTS mail_outbound_log_requested_idx
    ON mail_outbound_log (requested_at DESC);
CREATE INDEX IF NOT EXISTS mail_outbound_log_template_idx
    ON mail_outbound_log (template);
CREATE INDEX IF NOT EXISTS mail_outbound_log_status_idx
    ON mail_outbound_log (status);
