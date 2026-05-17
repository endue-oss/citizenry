#!/usr/bin/env bash
# Deploy citizenry Cloudflare Pages projects.
#
# Usage: deploy-pages.sh <app>...
#   apps: admin-web, docs
#
# Creates the Pages project on first run, then uploads the build output.
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GITHUB_SHA

set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?required}"
: "${CLOUDFLARE_ACCOUNT_ID:?required}"

if [[ $# -eq 0 ]]; then
  echo "::error::usage: $0 <app>... (apps: admin-web, docs)" >&2
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
  # workspace so `pnpm exec` resolves it regardless of CWD. The filter
  # also makes wrangler run from the app dir, so absolutize outdir.
  local abs_outdir
  abs_outdir=$(cd "$outdir" && pwd)
  local exec=(pnpm --filter "$filter" exec wrangler)

  echo "Ensuring Pages project $project exists…"
  # Use the CF REST API directly: wrangler's `pages project list --json`
  # interleaves its banner with the JSON payload and trips jq.
  local api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects"
  local exists
  exists=$(curl -fsSL -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$api" \
    | jq -r --arg n "$project" '.result[]? | select(.name == $n) | .name')
  if [[ -z "$exists" ]]; then
    "${exec[@]}" pages project create "$project" --production-branch=main
  else
    echo "·  project $project already exists"
  fi

  echo "Deploying $project from $outdir…"
  "${exec[@]}" pages deploy "$abs_outdir" \
    --project-name="$project" \
    --branch=main \
    --commit-hash="${GITHUB_SHA:-}" \
    --commit-message="deploy via GitHub Actions"
}

for app in "$@"; do
  case $app in
    admin-web) deploy_pages_app apps/admin-web @citizenry/admin-web citizenry-admin-web ;;
    docs)      deploy_pages_app apps/docs      @citizenry/docs      citizenry-docs apps/docs/dist ;;
    *)
      echo "::error::unknown app: $app (apps: admin-web, docs)" >&2
      exit 1
      ;;
  esac
done
