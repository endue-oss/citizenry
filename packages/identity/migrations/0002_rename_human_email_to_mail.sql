-- Rename `human.email` column to `human.mail` to align with the rest of the
-- mail-subsystem rename in citizenry. SQLite's ALTER TABLE ... RENAME COLUMN
-- (available since 3.25) preserves data and updates references; the inline
-- UNIQUE constraint follows the column. The constraint's SQLite-internal
-- name stays `human_email_uniq` because SQLite has no DDL to rename a
-- named constraint — that's cosmetic and harmless at runtime.

ALTER TABLE human RENAME COLUMN email TO mail;
