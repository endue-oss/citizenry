#!/usr/bin/env bash
# Apply identity Postgres migrations against IDENTITY_DATABASE_URL.
#
# Migrations live in packages/identity/migrations/*.sql and are written to be
# idempotent (CREATE SCHEMA / TABLE IF NOT EXISTS), so re-running the script
# on an already-migrated database is safe.
#
# A simple advisory check skips files that have already been recorded in
# `identity._migrations`. The table is created on first run.

set -euo pipefail

: "${IDENTITY_DATABASE_URL:?IDENTITY_DATABASE_URL is required}"

if ! command -v psql >/dev/null 2>&1; then
  echo "Installing postgresql-client…"
  sudo apt-get update -qq
  sudo apt-get install -y -qq postgresql-client
fi

PSQL=(psql "$IDENTITY_DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc --tuples-only --no-align)

"${PSQL[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS identity;
CREATE TABLE IF NOT EXISTS identity._migrations (
  filename     TEXT PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

shopt -s nullglob
applied_any=0
for f in packages/identity/migrations/*.sql; do
  basename=$(basename "$f")
  exists=$("${PSQL[@]}" -c "SELECT 1 FROM identity._migrations WHERE filename = '$basename' LIMIT 1;" | tr -d '[:space:]')
  if [[ "$exists" == "1" ]]; then
    echo "skip   $basename (already applied)"
    continue
  fi
  echo "::group::apply $basename"
  "${PSQL[@]}" -f "$f"
  "${PSQL[@]}" -c "INSERT INTO identity._migrations(filename) VALUES ('$basename');"
  echo "::endgroup::"
  applied_any=1
done

if [[ "$applied_any" -eq 0 ]]; then
  echo "identity Postgres: no pending migrations"
fi
