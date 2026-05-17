#!/usr/bin/env bash
# Deploy citizenry SvelteKit apps to Cloudflare Pages.
#
# Creates the Pages project on first run, then uploads .svelte-kit/cloudflare.
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_SHA

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?required}"
: "${CLOUDFLARE_ACCOUNT_ID:?required}"

deploy_pages_app() {
  local app_dir=$1 project=$2
  local outdir="$app_dir/.svelte-kit/cloudflare"

  if [[ ! -d "$outdir" ]]; then
    echo "::error::$outdir not built — run pnpm --filter <app> build first"
    exit 1
  fi

  echo "Ensuring Pages project $project exists…"
  if ! pnpm exec wrangler pages project list --json \
       | jq -e --arg n "$project" 'any(.[]; .name == $n)' >/dev/null; then
    pnpm exec wrangler pages project create "$project" --production-branch=main
  else
    echo "·  project $project already exists"
  fi

  echo "Deploying $project from $outdir…"
  pnpm exec wrangler pages deploy "$outdir" \
    --project-name="$project" \
    --branch=main \
    --commit-hash="${GITHUB_SHA:-}" \
    --commit-message="deploy via GitHub Actions"
}

deploy_pages_app apps/web        citizenry-web
deploy_pages_app apps/admin-web  citizenry-admin-web
