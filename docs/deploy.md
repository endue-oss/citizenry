# Deploy your own citizenry on Cloudflare

This repository ships a single GitHub Actions workflow
(`.github/workflows/deploy.yml`) that takes a fresh fork and turns it into a
running citizenry deployment on Cloudflare. You provide a Cloudflare account
plus a Postgres database; the workflow provisions everything else and applies
migrations on every run.

## Architecture being deployed

| Service              | Type           | Storage / Bindings                                 |
| -------------------- | -------------- | -------------------------------------------------- |
| `citizenry-api`       | Workers        | `DB_VAULT` (D1), `HYPERDRIVE` (Hyperdrive → Postgres) |
| `citizenry-admin-api` | Workers        | `DB_VAULT` (D1), `HYPERDRIVE`                       |
| `citizenry-mcp`       | Workers        | —                                                  |
| `citizenry-web`       | Pages          | static SvelteKit user web                          |
| `citizenry-admin-web` | Pages          | static SvelteKit admin web                         |

Storage:

- **D1** — `citizenry-vault` (vault domain). Migrations: `packages/vault/migrations/*.sql`.
- **Hyperdrive** — `citizenry-identity` (identity domain). Origin: any Postgres
  16+ instance you supply (Neon, Supabase, Cloud SQL, self-hosted, …).
  Migrations: `packages/identity/migrations/*.sql`.

## What you need (one time)

1. **A Cloudflare account.** Free tier is enough to start.
2. **A Postgres database** reachable from the public internet — Neon and
   Supabase both have free tiers that work. Save its connection URL in
   `postgresql://user:pass@host:5432/dbname` form. Hyperdrive sits in front
   of it, so you don't expose it on the hot path.

## Step 1 — Fork and clone

```bash
gh repo fork <upstream>/citizenry --clone
cd citizenry
```

## Step 2 — Create a scoped Cloudflare API token

Dashboard → My Profile → API Tokens → **Create Token** → "Custom token".
Grant **Edit** on:

- Account · Workers Scripts
- Account · Cloudflare Pages
- Account · D1
- Account · Hyperdrive

(All scoped to your account.) Copy the token.

Get your **Account ID** from the right sidebar on any Cloudflare dashboard page.

## Step 3 — Add GitHub secrets

In your fork: **Settings → Secrets and variables → Actions → New repository secret**.

### Required

| Name                      | Value                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`    | the token from step 2                                          |
| `CLOUDFLARE_ACCOUNT_ID`   | your account ID                                                |
| `IDENTITY_DATABASE_URL`   | `postgresql://user:pass@host:5432/db` (Postgres origin)        |

### Optional

If you skip these, the workflow auto-generates random 32-byte hex values on
first run and stores them as Cloudflare Worker secrets. The values then
persist in Cloudflare; the workflow won't overwrite them on subsequent runs.
Set them yourself if you want to control rotation from GitHub.

| Name                | Default behavior                                                 |
| ------------------- | ---------------------------------------------------------------- |
| `ENROLLMENT_PEPPER` | auto-generated (`openssl rand -hex 32`)                          |
| `SERVICE_KEY`       | auto-generated                                                   |
| `ADMIN_ALLOWLIST`   | not set; `admin-api` falls back to whatever its code defaults to |

If you want to pre-generate values yourself:

```bash
openssl rand -hex 32   # paste into GitHub as the secret value
```

### Optional GitHub **variables** (not secrets)

For public configuration: **Settings → Secrets and variables → Actions → Variables**.

| Name           | Purpose                                                      | Example                            |
| -------------- | ------------------------------------------------------------ | ---------------------------------- |
| `ISSUER_HOST`  | DID issuer host, written into `[vars] ISSUER_HOST`           | `id.example.com`                   |
| `JWT_AUDIENCE` | JWT audience list, written into `[vars] JWT_AUDIENCE`        | `api.id.example.com,citizenry-id`  |

If you omit these the value committed in each `wrangler.toml` is kept as-is.

## Step 4 — Run the workflow

Two options:

- **Push to `main`** — the workflow runs automatically.
- **Manual** — Actions tab → "Deploy to Cloudflare" → Run workflow.

On the first run, the workflow:

1. Creates the `citizenry-vault` D1 database.
2. Creates the `citizenry-identity` Hyperdrive config pointing at
   `IDENTITY_DATABASE_URL`.
3. Applies SQL migrations to both.
4. Builds and deploys three Workers (`api`, `admin-api`, `mcp`).
5. Builds the two SvelteKit apps and deploys them as Cloudflare Pages projects.
6. Pushes secrets to each Worker (auto-generated if not provided).

After the first run the same workflow is **idempotent**:

- D1 and Hyperdrive are looked up by name and only created if missing.
- Hyperdrive's origin connection is re-applied each run (so rotating
  `IDENTITY_DATABASE_URL` "just works").
- D1 migrations use Wrangler's tracking table; identity Postgres migrations
  use `identity._migrations` (filename-keyed). Re-running applies nothing
  if there's nothing new.
- Worker secrets are only pushed when you change them in GitHub or on the
  very first deploy.

## What gets deployed where

After a successful run, expect (replace `<sub>` with your `*.workers.dev` subdomain):

- `https://citizenry-api.<sub>.workers.dev`
- `https://citizenry-admin-api.<sub>.workers.dev`
- `https://citizenry-mcp.<sub>.workers.dev`
- `https://citizenry-web.pages.dev`
- `https://citizenry-admin-web.pages.dev`

The job summary at the bottom of each workflow run reproduces this table.

## Adding migrations later

- **D1 (vault)** — `cd packages/vault && pnpm db:generate` writes a new
  numbered file to `migrations/`. Commit. Next deploy will apply it.
- **Postgres (identity)** — `cd packages/identity && pnpm db:generate` writes
  a new SQL file. Commit. Next deploy will apply it via
  `scripts/ci/migrate-identity.sh`, which tracks applied files in
  `identity._migrations`.

## Custom domains

The workflow uses Cloudflare's default `*.workers.dev` and `*.pages.dev`
hostnames. To bind a custom domain:

1. Cloudflare dashboard → Workers & Pages → select a project → **Custom domains**.
2. Add your hostname. Cloudflare provisions a certificate and routes traffic.
3. Update the GitHub variables `ISSUER_HOST` and `JWT_AUDIENCE` so the next
   deploy bakes the new host into `[vars]`. Existing deploys can read the
   old `[vars]` until the next deploy.

## Troubleshooting

- **`Missing required secret(s): …`** — the workflow checks for the three
  required secrets up front and fails fast. Add them and re-run.
- **`CF ... failed: [10000] Authentication error`** — token doesn't include
  the permission Wrangler is asking for. Re-issue with the four Edit scopes
  listed in step 2.
- **Hyperdrive origin update fails** — make sure the Postgres database is
  reachable from the public internet (Cloudflare connects from its edge,
  not from GitHub) and that the credentials in `IDENTITY_DATABASE_URL` are
  current.
- **`wrangler d1 migrations apply` hangs on a confirmation prompt** — the
  workflow pipes `yes` into it. If you run it locally, append `--remote`
  and confirm interactively.

## Local development

Nothing in this guide changes local dev. You still run:

```bash
pnpm install
pnpm dev   # builds spec, then runs all five apps in parallel
```

`wrangler dev` uses miniflare for local D1 and ignores the production
`database_id`, so the committed `local-dev-placeholder` placeholders are
fine for offline use.
