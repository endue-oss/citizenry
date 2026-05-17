-- mail / citizenry — D1 (SQLite) initial schema.
--
-- Conventions:
--   - TEXT identifiers with ULID prefix (mb_, eml_, att_, thr_)
--   - INTEGER timestamps (unixepoch() * 1000) — ms since epoch
--   - JSON-encoded address lists and keyword sets, stored as TEXT
--   - BLOB column for attachment bytes (D1 row-size bound; large
--     attachments are out of scope for v1)


-- ── mailbox ─────────────────────────────────────────────────
-- Named folders owned by an agent. role = JMAP well-known role
-- (RFC 8621 §2) or NULL for custom mailboxes.
CREATE TABLE IF NOT EXISTS mailbox (
    mailbox_id      TEXT    NOT NULL,
    account_id      TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    role            TEXT,
    total_emails    INTEGER NOT NULL DEFAULT 0,
    unread_emails   INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT mailbox_pkey      PRIMARY KEY (mailbox_id),
    CONSTRAINT mailbox_role_check
        CHECK (role IS NULL OR role IN ('inbox','sent','drafts','archive','trash','junk'))
);

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_account_name_uniq
    ON mailbox (account_id, name);
CREATE INDEX IF NOT EXISTS mailbox_account_idx
    ON mailbox (account_id);


-- ── email ──────────────────────────────────────────────────
-- One row per message (inbound or outbound).
CREATE TABLE IF NOT EXISTS email (
    email_id              TEXT    NOT NULL,
    account_id            TEXT    NOT NULL,
    mailbox_id            TEXT    NOT NULL,

    thread_id             TEXT    NOT NULL,
    message_id            TEXT,
    in_reply_to           TEXT,
    refs                  TEXT    NOT NULL DEFAULT '[]',

    subject               TEXT,
    preview               TEXT,
    body_text             TEXT,
    body_html             TEXT,

    from_addr             TEXT,
    to_addrs              TEXT    NOT NULL DEFAULT '[]',
    cc_addrs              TEXT    NOT NULL DEFAULT '[]',
    bcc_addrs             TEXT    NOT NULL DEFAULT '[]',
    reply_to_addrs        TEXT    NOT NULL DEFAULT '[]',

    keywords              TEXT    NOT NULL DEFAULT '{}',
    size                  INTEGER NOT NULL DEFAULT 0,
    has_attachment        INTEGER NOT NULL DEFAULT 0,

    received_at           INTEGER NOT NULL,
    sent_at               INTEGER,

    direction             TEXT    NOT NULL,
    delivery_status       TEXT    NOT NULL,
    delivery_error        TEXT,
    provider_message_id   TEXT,

    created_at            INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT email_pkey                  PRIMARY KEY (email_id),
    CONSTRAINT email_mailbox_fk            FOREIGN KEY (mailbox_id)
        REFERENCES mailbox (mailbox_id) ON DELETE CASCADE,
    CONSTRAINT email_direction_check       CHECK (direction IN ('inbound','outbound')),
    CONSTRAINT email_delivery_status_check
        CHECK (delivery_status IN ('received','queued','sent','failed'))
);

CREATE INDEX IF NOT EXISTS email_account_idx
    ON email (account_id);
CREATE INDEX IF NOT EXISTS email_mailbox_received_idx
    ON email (mailbox_id, received_at);
CREATE INDEX IF NOT EXISTS email_thread_idx
    ON email (account_id, thread_id);
CREATE INDEX IF NOT EXISTS email_message_id_idx
    ON email (message_id);


-- ── email_attachment ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_attachment (
    attachment_id    TEXT    NOT NULL,
    email_id         TEXT    NOT NULL,
    filename         TEXT,
    content_type     TEXT    NOT NULL,
    size             INTEGER NOT NULL,
    cid              TEXT,
    inline           INTEGER NOT NULL DEFAULT 0,
    blob             BLOB    NOT NULL,

    CONSTRAINT email_attachment_pkey     PRIMARY KEY (attachment_id),
    CONSTRAINT email_attachment_email_fk FOREIGN KEY (email_id)
        REFERENCES email (email_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS email_attachment_email_idx
    ON email_attachment (email_id);
