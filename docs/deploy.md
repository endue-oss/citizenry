# Deploy your own citizenry on Cloudflare

This repository ships a single GitHub Actions workflow
(`.github/workflows/deploy.yml`) that takes a fresh fork and turns it into a
running citizenry deployment on Cloudflare. You provide a Cloudflare account;
the workflow provisions everything else and applies migrations on every run.

**External dependencies: zero.** Both identity and vault run on D1 —
no Postgres, no Hyperdrive.

## Architecture being deployed

| Service              | Type    | Storage / Bindings                               |
| -------------------- | ------- | ------------------------------------------------ |
| `citizenry-api`       | Workers | `DB_IDENTITY` (D1), `DB_VAULT` (D1)              |
| `citizenry-admin-api` | Workers | none — proxies to api `/_admin/*` via SERVICE_KEY |
| `citizenry-mcp`       | Workers | —                                                |
| `citizenry-web`       | Pages   | static SvelteKit user web                        |
| `citizenry-admin-web` | Pages   | static SvelteKit admin web                       |

Storage:

- **D1** `citizenry-vault` — vault domain. Migrations: `packages/vault/migrations/*.sql`.
- **D1** `citizenry-identity` — identity domain. Migrations: `packages/identity/migrations/*.sql`.

Admin model:

- `admin-api` no longer touches a database directly. Every admin
  operation is HTTP-proxied to `api`'s `/_admin/*` routes; both Workers
  share the same `SERVICE_KEY` PSK to authenticate the hop. Because of
  this layout, **the api Worker alone provides every essential
  function** — `admin-api` is optional.

## What you need (one time)

**A Cloudflare account.** The free tier is enough to get started. No
external database, no credit card.

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

(All scoped to your account.) Copy the token.

Get your **Account ID** from the right sidebar on any Cloudflare dashboard page.

## Step 3 — Add GitHub secrets

In your fork: **Settings → Secrets and variables → Actions → New repository secret**.

### Required

| Name                      | Value                |
| ------------------------- | -------------------- |
| `CLOUDFLARE_API_TOKEN`    | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID`   | your account ID      |

### Optional secrets (overrides only)

These have no required values — every deploy reads them from D1
`citizenry-identity._config`, generating a random 32-byte hex on first
run if absent. The value persists there for the life of the database
and is copied into the matching Worker secrets on each deploy.

Set the matching GitHub secret only if you want to pin or rotate the
value from the repository — the override is written into `_config`
(upsert), then pushed to the workers.

| Name                | Stored in                            | Used by                              |
| ------------------- | ------------------------------------ | ------------------------------------ |
| `ENROLLMENT_PEPPER` | D1 `_config(key='enrollment_pepper')` | `api` (Worker secret)                |
| `SERVICE_KEY`       | D1 `_config(key='service_key')`       | `api` and `admin-api` (same value)   |

#### Inspecting values

```bash
wrangler d1 execute citizenry-identity --remote \
  --command="SELECT key, value FROM _config;"
```

Or open Cloudflare Dashboard → D1 → `citizenry-identity` → **Console**.

#### Rotating a value

```bash
wrangler d1 execute citizenry-identity --remote \
  --command="DELETE FROM _config WHERE key='service_key';"
```

The next deploy generates a fresh value and pushes it to both Workers.

### Optional GitHub **variables** (not secrets)

For public configuration: **Settings → Secrets and variables → Actions → Variables**.

| Name           | Purpose                                                                                  | Example                            |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| `ISSUER_HOST`  | DID issuer host, written into api/admin-api `[vars] ISSUER_HOST`                         | `id.example.com`                   |
| `JWT_AUDIENCE` | JWT audience list, written into api `[vars] JWT_AUDIENCE`                                | `api.id.example.com,citizenry-id`  |
| `API_BASE_URL` | URL that `admin-api` proxies to. Auto-detected from the workers.dev subdomain if unset. | `https://api.example.com`          |

When omitted, the committed `wrangler.toml` value is kept as-is.

## Step 4 — Run the workflow

Two options:

- **Push to `main`** — the workflow runs automatically.
- **Manual** — Actions tab → "Deploy to Cloudflare" → Run workflow.

On the first run, the workflow:

1. Creates the `citizenry-vault` and `citizenry-identity` D1 databases.
2. Patches the real database UUIDs and any optional `[vars]` overrides
   into the committed `wrangler.toml` files in place.
3. Applies migrations to both D1 databases via
   `wrangler d1 migrations apply`.
4. Builds and deploys the three Workers (`api`, `admin-api`, `mcp`).
5. Builds the two SvelteKit apps and deploys them as Cloudflare Pages
   projects.
6. Pushes Worker secrets, auto-generating any value that's missing.

Subsequent runs are idempotent:

- D1 databases are looked up by name and only created when missing.
- D1 migrations rely on Wrangler's tracking table; only new files are
  applied.
- Worker secrets are pushed only when a GitHub secret changes or on the
  first deploy.

## What gets deployed where

After a successful run (`<sub>` = your `*.workers.dev` subdomain):

- `https://citizenry-api.<sub>.workers.dev`
- `https://citizenry-admin-api.<sub>.workers.dev`
- `https://citizenry-mcp.<sub>.workers.dev`
- `https://citizenry-web.pages.dev`
- `https://citizenry-admin-web.pages.dev`

The same table is rendered in the Summary of every workflow run.

## Adding migrations later

Add SQL files under `packages/identity/migrations/`,
`packages/vault/migrations/`, or `packages/mail/migrations/`. Each file
must be idempotent (`CREATE ... IF NOT EXISTS`).

The next deploy applies them via `wrangler d1 migrations apply`, which
uses its tracking table to skip files that are already present.

## Enabling email (optional)

`apps/mail` is deployed unconditionally, but inbound mail delivery and
outbound sending each need a one-time setup. Skip this section and the
worker is still reachable — `GET /_health` works, outbound goes through
the log-only sender, inbound never fires because no MX records point at
Cloudflare.

### Inbound (Cloudflare Email Routing)

1. **Dashboard → Email → Email Routing** for the zone matching your
   `MAIL_DOMAIN` GitHub variable (e.g. `mail.example.com`).
2. Enable Email Routing. Cloudflare auto-suggests three MX records —
   add them to your zone.
3. Create one routing rule:
   - **Match** `*@<MAIL_DOMAIN>` (catch-all)
   - **Action** *Send to a Worker* → pick `citizenry-mail`
4. Verify with a test message. `citizenry-mail`'s `email()` handler
   resolves the local-part against `identity.agent.slug`; unknown
   recipients are dropped silently (see
   [`apps/mail/src/inbound/handler.ts`](../apps/mail/src/inbound/handler.ts)).

No `wrangler.toml` block is needed — the routing rule lives only in
Cloudflare's configuration and survives redeploys.

### Outbound (Resend)

1. Sign up at [resend.com](https://resend.com), verify your sending
   domain, and create an API key.
2. Add a GitHub repository **secret** named `RESEND_API_KEY` with that
   value.
3. Re-run the workflow. `scripts/ci/bootstrap-secrets.sh` pushes the
   secret to `citizenry-mail`; subsequent `POST /emails` calls deliver
   via Resend instead of falling back to the log-only sender.

To rotate the key, update the GitHub secret and redeploy. To remove it,
delete the secret in GitHub and run `wrangler secret delete
RESEND_API_KEY` against `citizenry-mail`.

## Custom domains

The defaults are `*.workers.dev` / `*.pages.dev`. To attach a custom
domain:

1. Cloudflare dashboard → Workers & Pages → select a project →
   **Custom domains**.
2. Add the hostname. Cloudflare issues a certificate automatically.
3. Update the GitHub variables `ISSUER_HOST` / `JWT_AUDIENCE` /
   `API_BASE_URL`. The next deploy bakes the new host into `[vars]`.

## Troubleshooting

- **`Missing required secret(s): …`** — the first step checks the two
  required secrets and fails fast.
- **`CF ... failed: [10000] Authentication error`** — the token lacks
  a required permission. Re-issue with the three Edit scopes listed in
  step 2.
- **admin-api calls return 401** — `SERVICE_KEY` must be the same value
  on both `api` and `admin-api`. Set the GitHub secret explicitly and
  redeploy.
- **`wrangler d1 migrations apply` hangs at the confirmation prompt** —
  the workflow pipes `yes` into it. When you run it locally, type `y`
  yourself.

## Local development

```bash
pnpm install
pnpm dev   # builds spec, then runs all apps in parallel
```

`wrangler dev` uses miniflare's local D1 and ignores the production
`database_id` — the committed `local-dev-placeholder` works as-is for
offline development.
