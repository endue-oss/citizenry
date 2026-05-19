#!/usr/bin/env bash
# Bootstrap instance secrets with zero user input.
#
# Policy:
#   - D1 table `_config` (in ${PREFIX}-identity-db, default citizenry-identity-db)
#     is the source of truth —
#     once a value lands there, it persists for the life of the database.
#   - Every deploy reads `_config`, copies values into Worker secrets so
#     runtime code can use them. If a key is missing, a fresh random value
#     is generated, inserted into `_config`, and pushed.
#   - GitHub secret overrides (if provided) take precedence and overwrite
#     the `_config` row, so an operator can pin or rotate from the repo.
#
# Key → Worker mapping:
#   enrollment_pepper      → apps/api         ENROLLMENT_PEPPER
#   service_key            → apps/api         SERVICE_KEY
#                           apps/admin-api    SERVICE_KEY    (same value)
#   admin_jwt_secret       → apps/admin-api   ADMIN_JWT_SECRET
#   admin_refresh_pepper   → apps/admin-api   ADMIN_REFRESH_PEPPER
#
# Operator-supplied or auto-generated:
#   ADMIN_PASSWORD     → upserts citizenry-config-db.config(admin.password).
#                        When unset and no existing row, seed-admin.mjs
#                        generates a fresh passphrase. Operator reads it
#                        via `wrangler d1 execute citizenry-config-db ...`.
#
# Outbound provider credentials (Resend, AWS SES) are operator-managed
# through the admin api `PUT /v1/admin/config/:key`. They are not
# handled here. See apps/mail/wrangler.toml for the key list.
#
# Inspect values:
#   wrangler d1 execute citizenry-identity-db --remote \
#     --command="SELECT key, value FROM _config;"
#   (or open Cloudflare Dashboard → D1 → ${PREFIX}-identity-db → Console.)
#
# Rotate a value:
#   wrangler d1 execute citizenry-identity-db --remote \
#     --command="DELETE FROM _config WHERE key='...';"
#   The next deploy generates and pushes a new random value.
#
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# Optional env: SERVICE_PREFIX (default "citizenry") — controls the D1 name
#               that holds the `_config` table. Must match what
#               provision.mjs / render-wrangler.mjs used.
# Optional env (overrides):   ENROLLMENT_PEPPER, SERVICE_KEY
# Prereq: D1 migrations applied — `_config` table must exist before this runs.

set -euo pipefail

PREFIX="${SERVICE_PREFIX:-citizenry}"
D1_NAME="${PREFIX}-identity-db"
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
# mail uses the same PSK to authenticate inbound calls from api /
# admin-api on its /_internal/notify route — see ADR-2026-0005.
push_secret apps/mail      SERVICE_KEY "$service_key"
echo "::endgroup::"

# ── ADMIN_JWT_SECRET (admin-api only) ──────────────────────────────
# HS256 signing secret for admin-api access tokens. Auto-generated on
# first deploy, persisted in _config, and pushed verbatim thereafter.
echo "::group::ADMIN_JWT_SECRET"
admin_jwt_secret=$(ensure_config 'admin_jwt_secret' "${ADMIN_JWT_SECRET:-}")
echo "::add-mask::$admin_jwt_secret"
push_secret apps/admin-api ADMIN_JWT_SECRET "$admin_jwt_secret"
echo "::endgroup::"

# ── ADMIN_REFRESH_PEPPER (admin-api only) ──────────────────────────
# Pepper folded into refresh-token hashes stored in
# admin_refresh_token.token_hash. Auto-generated and pinned.
echo "::group::ADMIN_REFRESH_PEPPER"
admin_refresh_pepper=$(ensure_config 'admin_refresh_pepper' "${ADMIN_REFRESH_PEPPER:-}")
echo "::add-mask::$admin_refresh_pepper"
push_secret apps/admin-api ADMIN_REFRESH_PEPPER "$admin_refresh_pepper"
echo "::endgroup::"

# ── Seed admin.password into the config D1 ─────────────────────────
# When ADMIN_PASSWORD is set, the script rotates the existing value
# (or inserts it on first run). When unset, the script auto-generates a
# fresh passphrase on the very first deploy and is a no-op afterwards.
# Either way the plaintext stays out of CI logs — operators retrieve it
# via `wrangler d1 execute ${PREFIX}-config-db ...`.
echo "::group::seed-admin"
if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  echo "::add-mask::$ADMIN_PASSWORD"
fi
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
  SERVICE_PREFIX="$PREFIX" \
  node scripts/ci/seed-admin.mjs
echo "::endgroup::"

echo
echo "✓ Bootstrap complete."
echo "  Inspect identity secrets: wrangler d1 execute $D1_NAME --remote --command=\"SELECT key, value FROM _config;\""
echo "  Inspect runtime config  : wrangler d1 execute ${PREFIX}-config-db --remote --command=\"SELECT config_key, config_value FROM config;\""
