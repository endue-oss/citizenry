-- mail / citizenry — inbound audit log.
--
-- Every Cloudflare Email Worker invocation writes one row here, even
-- when the message is rejected or dropped. Lets operators verify that
-- mail is actually arriving and diagnose silent-drop paths
-- (agent slug not found, wrong host, parse failure, etc.) without
-- relying on Worker logs alone.
--
-- Successful inbound goes here AND into `mail` — `mail_id` cross-refs
-- the stored row. Dropped messages get `mail_id IS NULL` and a
-- `disposition` value that explains why.

CREATE TABLE IF NOT EXISTS mail_inbound_log (
    inbound_log_id   TEXT    NOT NULL,
    received_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    rcpt_to          TEXT    NOT NULL,
    mail_from        TEXT,
    raw_size         INTEGER,

    -- One of:
    --   'stored'                 — persisted to `mail` (mail_id is set)
    --   'duplicate'              — Message-ID already stored (mail_id is set)
    --   'malformed_recipient'    — rcpt_to has no '@'
    --   'wrong_host'             — host part not MAIL_DOMAIN
    --   'unresolved_recipient'   — no agent.slug matches local-part
    --   'parse_failed'           — postal-mime threw
    --   'store_failed'           — INSERT into mail threw
    disposition      TEXT    NOT NULL,

    -- Populated when the local-part resolved to an agent.
    account_id       TEXT,
    -- Populated when the row landed in `mail`.
    mail_id          TEXT,
    -- RFC 5322 Message-ID, when parsing succeeded.
    message_id       TEXT,
    -- Free-form failure detail when disposition indicates an error.
    error_message    TEXT,

    CONSTRAINT mail_inbound_log_pkey   PRIMARY KEY (inbound_log_id),
    CONSTRAINT mail_inbound_log_disposition_check CHECK (disposition IN (
        'stored',
        'duplicate',
        'malformed_recipient',
        'wrong_host',
        'unresolved_recipient',
        'parse_failed',
        'store_failed'
    ))
);

CREATE INDEX IF NOT EXISTS mail_inbound_log_received_idx
    ON mail_inbound_log (received_at DESC);
CREATE INDEX IF NOT EXISTS mail_inbound_log_rcpt_to_idx
    ON mail_inbound_log (rcpt_to);
CREATE INDEX IF NOT EXISTS mail_inbound_log_disposition_idx
    ON mail_inbound_log (disposition);
