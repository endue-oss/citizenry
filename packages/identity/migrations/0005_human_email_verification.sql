-- identity / citizenry — human email-verification flow.
--
-- Self-service human registration sends a 6-digit code to the
-- supplied mail address; the recipient confirms ownership by
-- presenting the code at POST /api/v1/humans/:id/verify within
-- 30 minutes. Resend is rate-limited by an arithmetic backoff
-- (1, 2, 3, ... minutes, capped at 60).
--
-- A new `human.status` value is introduced: 'pending_verification'.
-- It is recognized by the column's free-form TEXT shape — there is
-- no CHECK constraint on `human.status` in the 0001 schema, so no
-- ALTER is needed beyond the new table.

CREATE TABLE IF NOT EXISTS human_email_verification (
    verification_id   TEXT    NOT NULL,
    principal_id      TEXT    NOT NULL,

    -- SHA-256(code || ENROLLMENT_PEPPER). Never store the plaintext.
    code_hash         BLOB    NOT NULL,

    -- Absolute deadline (created_at + 30 * 60_000 ms). After this
    -- point the row is dead-on-arrival; the server returns 410.
    expires_at        INTEGER NOT NULL,

    -- When the recipient successfully verified. NULL until then.
    verified_at       INTEGER,

    -- Number of times the code has been re-sent (does not include
    -- the initial send). Drives the backoff schedule.
    resend_count      INTEGER NOT NULL DEFAULT 0,

    -- Wall-clock of the most recent send (initial or resend).
    last_sent_at      INTEGER NOT NULL,

    -- Earliest wall-clock at which the next resend is allowed.
    -- = last_sent_at + min(resend_count + 1, 60) * 60_000 ms.
    next_resend_at    INTEGER NOT NULL,

    created_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

    CONSTRAINT human_email_verification_pkey
        PRIMARY KEY (verification_id),
    -- One outstanding verification row per principal at a time.
    CONSTRAINT human_email_verification_principal_uniq
        UNIQUE (principal_id),
    CONSTRAINT human_email_verification_principal_fk
        FOREIGN KEY (principal_id)
        REFERENCES human (principal_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS human_email_verification_expires_idx
    ON human_email_verification (expires_at);
