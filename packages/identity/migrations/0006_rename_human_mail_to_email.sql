-- Reverse 0002: rename `human.mail` back to `human.email` so the column
-- name matches the project-wide identifier ("email") used in specs,
-- service code, and the `human_email_verification` table. The inline
-- UNIQUE constraint follows the column rename; the SQLite-internal
-- constraint name stays `human_email_uniq`, which now reads correctly.

ALTER TABLE human RENAME COLUMN mail TO email;
