# Deploy your own citizenry on Cloudflare

This repository ships a single GitHub Actions workflow
(`.github/workflows/deploy.yml`) that takes a fresh fork and turns it into a
running citizenry deployment on Cloudflare. You provide a Cloudflare account;
the workflow provisions everything else and applies migrations on every run.

**External dependencies: zero.** Both identity and vault run on D1 —
no Postgres, no Hyperdrive.

## Architecture being deployed

| Service              | Type    | Storage / Bindings                                                 |
| -------------------- | ------- | ------------------------------------------------------------------ |
| `citizenry-api`       | Workers | `DB_IDENTITY` (D1), `DB_VAULT` (D1), `DB_CONFIG` (D1)              |
| `citizenry-admin-api` | Workers | `DB_IDENTITY` (D1, refresh tokens), `DB_CONFIG` (D1, admin password), API service binding (X-Service-Key) |
| `citizenry-mcp`       | Workers | —                                                                  |
| `citizenry-mail`      | Workers | `DB_IDENTITY` (D1), `DB_MAIL` (D1), `DB_CONFIG` (D1), MAIL binding |
| `citizenry-admin-web` | Pages   | static SvelteKit admin console (ops-only)                          |

Storage:

- **D1** `citizenry-vault` — vault domain. Migrations: `packages/vault/migrations/*.sql`.
- **D1** `citizenry-identity` — identity domain. Migrations: `packages/identity/migrations/*.sql`.
- **D1** `citizenry-mail` — mail domain. Migrations: `packages/mail/migrations/*.sql`.
- **D1** `citizenry-config` — runtime control-plane key/value store.
  Written through admin-api (api `/_admin/api/v1/admin/config/*`), read
  by data-plane code via `packages/config` with a colo-local TTL cache
  (default 5 minutes). Every key follows `{namespace}.{keyname}` —
  e.g. `admin.password`, `mail.resend_api_key`. Migrations:
  `packages/config/migrations/*.sql`.

Admin model:

- Operators sign in to `admin-api` with an **admin ID + password**.
  `admin-api` issues an HS256 JWT **access token** (default 15 min TTL)
  and an opaque **refresh token** that is rotated on every use. Both
  tokens are signed/peppered with secrets the deploy generates and
  stores in identity D1 `_config`:
  - `admin_jwt_secret`  → admin-api `ADMIN_JWT_SECRET`
  - `admin_refresh_pepper` → admin-api `ADMIN_REFRESH_PEPPER`
- The admin password itself lives in the **config D1** under key
  `admin.password` (plaintext, JSON-encoded by the config storage
  convention). `admin-api` reads it through `packages/config`'s
  cached reader (5-minute colo-local TTL).
- On first deploy, if `ADMIN_PASSWORD` is unset and no `admin.password`
  row exists, the CI bootstrap step generates a 32-character random
  passphrase and inserts it. The plaintext **never appears in workflow
  logs** — operators retrieve it through their own Cloudflare
  credential channel (see "Retrieving the admin password" below).
  Setting `ADMIN_PASSWORD` rotates the value; leaving it unset on
  subsequent deploys is a no-op.
- Every `/api/v1/admin/*` route on `admin-api` requires the access
  token. After verification, `admin-api` proxies the request to api
  `/_admin/*` with the existing `SERVICE_KEY` PSK plus an `X-Admin-Id`
  breadcrumb. The two layers of auth keep operator credentials
  separate from inter-worker PSKs.

### Retrieving the admin password

```bash
wrangler d1 execute citizenry-config-db --remote \
  --command="SELECT config_value FROM config WHERE config_key='admin.password';"
```

The cell value is JSON-encoded (the literal contents are
`"the-password"`, surrounding quotes included). Pipe through `jq -r`
or strip the quotes manually to get the raw password. Rotating: set
the `ADMIN_PASSWORD` GitHub secret and redeploy, or write directly
via `wrangler d1 execute`/the admin config API.

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

| Name                  | Stored in                                | Used by                              |
| --------------------- | ---------------------------------------- | ------------------------------------ |
| `ENROLLMENT_PEPPER`   | D1 `_config(key='enrollment_pepper')`     | `api` (Worker secret)                |
| `SERVICE_KEY`         | D1 `_config(key='service_key')`           | `api` and `admin-api` (same value)   |
| `ADMIN_JWT_SECRET`    | D1 `_config(key='admin_jwt_secret')`      | `admin-api` (HS256 sign + verify)    |
| `ADMIN_REFRESH_PEPPER`| D1 `_config(key='admin_refresh_pepper')`  | `admin-api` (refresh-token hash pepper) |

### Admin credential

| Name             | Effect                                                                |
| ---------------- | --------------------------------------------------------------------- |
| `ADMIN_PASSWORD` | When set, CI bootstrap upserts `config(admin.password)` in `citizenry-config-db`. When unset on the first deploy, a random 32-char passphrase is generated; subsequent deploys leave the row untouched. |
| `ADMIN_ID` (var) | Admin login id baked into `apps/admin-api`. Defaults to `admin`.       |

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
5. Builds the SvelteKit Pages apps (`admin-web`, `docs`) and deploys
   them as Cloudflare Pages projects.
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
- `https://citizenry-admin-web.pages.dev`

The same table is rendered in the Summary of every workflow run.

## Adding migrations later

Add SQL files under `packages/identity/migrations/`,
`packages/vault/migrations/`, or `packages/mail/migrations/`. Each file
must be idempotent (`CREATE ... IF NOT EXISTS`).

The next deploy applies them via `wrangler d1 migrations apply`, which
uses its tracking table to skip files that are already present.

## Enabling mail (optional)

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
   secret to `citizenry-mail`; subsequent `POST /mails` calls deliver
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
