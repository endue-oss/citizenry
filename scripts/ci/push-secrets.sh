#!/usr/bin/env bash
# Push Worker secrets after Workers have been deployed.
#
# Logic per secret:
#   - GitHub secret provided  → push to Cloudflare (override existing)
#   - GitHub secret empty + CF already has it → leave as-is
#   - GitHub secret empty + CF doesn't have it → generate random 32-byte hex,
#     push, and emit a warning that the value lives only in Cloudflare.
#
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
# Optional env: ENROLLMENT_PEPPER, SERVICE_KEY, ADMIN_ALLOWLIST

set -euo pipefail

push() {
  local app_dir=$1 name=$2 value=$3
  echo "→ setting $name on $app_dir"
  (cd "$app_dir" && printf '%s' "$value" | pnpm exec wrangler secret put "$name")
}

cf_has_secret() {
  local app_dir=$1 name=$2
  local out
  if ! out=$(cd "$app_dir" && pnpm exec wrangler secret list --format json 2>/dev/null); then
    return 1
  fi
  echo "$out" | jq -e --arg n "$name" 'any(.[]; .name == $n)' >/dev/null
}

ensure_secret() {
  local app_dir=$1 name=$2 supplied=$3
  if [[ -n "$supplied" ]]; then
    push "$app_dir" "$name" "$supplied"
    return
  fi
  if cf_has_secret "$app_dir" "$name"; then
    echo "·  $name already set on $app_dir; leaving as-is"
    return
  fi
  local v
  v=$(openssl rand -hex 32)
  push "$app_dir" "$name" "$v"
  echo "::warning::Auto-generated $name for $app_dir. Value persists in Cloudflare. Set a GitHub secret with the same name to control it."
}

ensure_secret apps/api ENROLLMENT_PEPPER "${ENROLLMENT_PEPPER:-}"
ensure_secret apps/admin-api ENROLLMENT_PEPPER "${ENROLLMENT_PEPPER:-}"
ensure_secret apps/admin-api SERVICE_KEY "${SERVICE_KEY:-}"

if [[ -n "${ADMIN_ALLOWLIST:-}" ]]; then
  push apps/admin-api ADMIN_ALLOWLIST "${ADMIN_ALLOWLIST}"
fi
