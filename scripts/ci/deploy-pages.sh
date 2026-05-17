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
  local app_dir=$1 filter=$2 project=$3
  local outdir=${4:-"$app_dir/.svelte-kit/cloudflare"}

  if [[ ! -d "$outdir" ]]; then
    echo "::error::$outdir not built — run pnpm --filter $filter build first"
    exit 1
  fi

  # wrangler lives in each app's local node_modules; scope pnpm to that
  # workspace so `pnpm exec` resolves it regardless of CWD.
  local exec=(pnpm --filter "$filter" exec wrangler)

  echo "Ensuring Pages project $project exists…"
  if ! "${exec[@]}" pages project list --json \
       | jq -e --arg n "$project" 'any(.[]; .name == $n)' >/dev/null; then
    "${exec[@]}" pages project create "$project" --production-branch=main
  else
    echo "·  project $project already exists"
  fi

  echo "Deploying $project from $outdir…"
  "${exec[@]}" pages deploy "$outdir" \
    --project-name="$project" \
    --branch=main \
    --commit-hash="${GITHUB_SHA:-}" \
    --commit-message="deploy via GitHub Actions"
}

for app in "$@"; do
  case $app in
    web)       deploy_pages_app apps/web       @citizenry/web       citizenry-web ;;
    admin-web) deploy_pages_app apps/admin-web @citizenry/admin-web citizenry-admin-web ;;
    docs)      deploy_pages_app apps/docs      @citizenry/docs      citizenry-docs apps/docs/dist ;;
    *)
      echo "::error::unknown app: $app (apps: web, admin-web, docs)" >&2
      exit 1
      ;;
  esac
done
