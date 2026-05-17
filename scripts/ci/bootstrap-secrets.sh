#!/usr/bin/env bash
# Bootstrap instance secrets with zero user input.
#
# Policy:
#   - D1 table `_config` (in citizenry-identity) is the source of truth —
#     once a value lands there, it persists for the life of the database.
#   - Every deploy reads `_config`, copies values into Worker secrets so
#     runtime code can use them. If a key is missing, a fresh random value
#     is generated, inserted into `_config`, and pushed.
#   - GitHub secret overrides (if provided) take precedence and overwrite
#     the `_config` row, so an operator can pin or rotate from the repo.
#
# Key → Worker mapping:
#   enrollment_pepper  → apps/api         ENROLLMENT_PEPPER
#   service_key        → apps/api         SERVICE_KEY
#                       apps/admin-api   SERVICE_KEY    (same value)
#
# Inspect values:
#   wrangler d1 execute citizenry-identity --remote \
#     --command="SELECT key, value FROM _config;"
#   (or open Cloudflare Dashboard → D1 → citizenry-identity → Console.)
#
# Rotate a value:
#   wrangler d1 execute citizenry-identity --remote \
#     --command="DELETE FROM _config WHERE key='...';"
#   The next deploy generates and pushes a new random value.
#
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# Optional env (overrides): ENROLLMENT_PEPPER, SERVICE_KEY
# Prereq: D1 migrations applied — `_config` table must exist before this runs.

set -euo pipefail

D1_NAME="citizenry-identity"
# `wrangler d1 execute` reads wrangler.toml from the caller's cwd.
WORK_DIR="apps/api"

# ── D1 query helpers ────────────────────────────────────────────────

d1_query() {
  local cmd=$1
  (cd "$WORK_DIR" && pnpm exec wrangler d1 execute "$D1_NAME" --remote \
    --command="$cmd" --json 2>/dev/null)
}

get_config() {
  local key=$1
  d1_query "SELECT value FROM _config WHERE key='$key';" \
    | jq -r '.[0].results[0].value // empty'
}

upsert_config() {
  local key=$1 value=$2
  d1_query "INSERT INTO _config (key, value) VALUES ('$key', '$value') \
    ON CONFLICT(key) DO UPDATE SET value=excluded.value;" >/dev/null
}

# Returns the effective value for a config key, applying this precedence:
#   1. Env override (operator-pinned via GitHub secret) — upserted into D1.
#   2. Existing value in D1 — reused.
#   3. Freshly generated 32-byte hex — inserted into D1.
ensure_config() {
  local key=$1 override=${2:-}
  if [[ -n "$override" ]]; then
    upsert_config "$key" "$override"
    echo "$override"
    return
  fi
  local existing
  existing=$(get_config "$key")
  if [[ -n "$existing" ]]; then
    echo "$existing"
    return
  fi
  local v
  v=$(openssl rand -hex 32)
  # INSERT OR IGNORE handles the concurrent-deploy race; the loser re-reads
  # the winner's value below.
  d1_query "INSERT OR IGNORE INTO _config (key, value) VALUES ('$key', '$v');" >/dev/null
  get_config "$key"
}

# ── Worker secret push ─────────────────────────────────────────────

push_secret() {
  local app_dir=$1 name=$2 value=$3
  echo "→ pushing $name to $app_dir"
  (cd "$app_dir" && printf '%s' "$value" | pnpm exec wrangler secret put "$name")
}

# ── ENROLLMENT_PEPPER (api only) ───────────────────────────────────
echo "::group::ENROLLMENT_PEPPER"
pepper=$(ensure_config 'enrollment_pepper' "${ENROLLMENT_PEPPER:-}")
echo "::add-mask::$pepper"
push_secret apps/api ENROLLMENT_PEPPER "$pepper"
echo "::endgroup::"

# ── SERVICE_KEY (api + admin-api, identical value) ─────────────────
echo "::group::SERVICE_KEY"
service_key=$(ensure_config 'service_key' "${SERVICE_KEY:-}")
echo "::add-mask::$service_key"
push_secret apps/api       SERVICE_KEY "$service_key"
push_secret apps/admin-api SERVICE_KEY "$service_key"
echo "::endgroup::"

echo
echo "✓ Bootstrap complete. Values persist in D1 \`$D1_NAME._config\`."
echo "  Inspect: wrangler d1 execute $D1_NAME --remote --command=\"SELECT key, value FROM _config;\""
