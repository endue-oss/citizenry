#!/usr/bin/env bash
# Deploy citizenry Cloudflare Pages projects.
#
# Usage: deploy-pages.sh <app>...
#   apps: web, admin-web, docs
#
# Creates the Pages project on first run, then uploads the build output.
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_SHA

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?required}"
: "${CLOUDFLARE_ACCOUNT_ID:?required}"

if [[ $# -eq 0 ]]; then
  echo "::error::usage: $0 <app>... (apps: web, admin-web, docs)" >&2
  exit 1
fi

deploy_pages_app() {
  local app_dir=$1 project=$2
  local outdir=${3:-"$app_dir/.svelte-kit/cloudflare"}

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

for app in "$@"; do
  case $app in
    web)       deploy_pages_app apps/web       citizenry-web ;;
    admin-web) deploy_pages_app apps/admin-web citizenry-admin-web ;;
    docs)      deploy_pages_app apps/docs      citizenry-docs apps/docs/dist ;;
    *)
      echo "::error::unknown app: $app (apps: web, admin-web, docs)" >&2
      exit 1
      ;;
  esac
done
