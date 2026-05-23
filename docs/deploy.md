# Deploy your own citizenry

A start-to-finish guide for running citizenry on Cloudflare. No prior
DevOps experience is assumed - if you can fork a repo on GitHub and
click through a dashboard, you can complete this guide.

**You will end up with:**

- Five Workers and two Pages sites running on your Cloudflare account
- An admin console you can sign in to from a browser
- A working agent-facing API, MCP gateway, and mail worker
- A GitHub Actions workflow that redeploys on every push to `main`

**Time required:** about 15 minutes for a first deploy, most of which
is waiting for GitHub Actions.

**Cost:** Cloudflare's free tier is enough to get started. No credit
card needed. No external database, no servers to rent.

---

## Table of contents

1. [Before you begin](#before-you-begin)
2. [Step 1 - Fork the repository](#step-1--fork-the-repository)
3. [Step 2 - Create a Cloudflare API token](#step-2--create-a-cloudflare-api-token)
4. [Step 3 - Find your Cloudflare Account ID](#step-3--find-your-cloudflare-account-id)
5. [Step 4 - Add the two required secrets to your fork](#step-4--add-the-two-required-secrets-to-your-fork)
6. [Step 5 - Run the deploy workflow](#step-5--run-the-deploy-workflow)
7. [Step 6 - Retrieve the admin password](#step-6--retrieve-the-admin-password)
8. [Step 7 - Sign in to the admin console](#step-7--sign-in-to-the-admin-console)
9. [Day-to-day operations](#day-to-day-operations)
10. [Optional: enable outbound and inbound mail](#optional-enable-outbound-and-inbound-mail)
11. [Optional: use your own domain names](#optional-use-your-own-domain-names)
12. [Troubleshooting](#troubleshooting)
13. [Reference](#reference)

---

## Before you begin

You need three things, all free:

1. **A GitHub account.** You will fork this repo there and let GitHub
   Actions do the heavy lifting.
2. **A Cloudflare account.** Sign up at
   [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
   You do **not** need to add a payment method or buy a domain to
   complete this guide.
3. **A web browser.** That's it - you do not need a local development
   environment, `wrangler`, `node`, or `pnpm` to deploy. (Those are
   only needed if you later want to inspect data from a terminal,
   which is covered in [Day-to-day operations](#day-to-day-operations).)

**Helpful but not required:**

- [GitHub CLI (`gh`)](https://cli.github.com/) - for one-line forking.
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) -
  Cloudflare's command-line tool, used for reading database rows after
  deploy.

> **No code editing is needed for a default deploy.** Everything is
> driven by GitHub Secrets and the workflow.

---

## Step 1 - Fork the repository

Forking creates **your own copy** of the project on GitHub. All
subsequent steps happen on your fork; the upstream repository is
untouched.

### Option A - GitHub website (recommended)

1. Open the upstream repository in your browser.
2. Click the **Fork** button in the top-right corner.
3. Leave "Copy the `main` branch only" checked. Click **Create fork**.

You now have `https://github.com/<your-username>/citizenry`.

### Option B - GitHub CLI

```bash
gh repo fork <upstream>/citizenry --clone
cd citizenry
```

> **You don't need to keep a local clone.** The deploy runs entirely
> on GitHub Actions. A clone is only useful if you plan to edit code,
> resolve merge conflicts when pulling upstream updates, or run
> `wrangler` commands from your machine.

---

## Step 2 - Create a Cloudflare API token

The GitHub Actions workflow uses this token to provision databases
and deploy Workers on your behalf. The token is scoped to **only**
what the workflow needs - it cannot, for example, change your
billing settings.

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Click your profile icon (top-right) → **My Profile**.
3. Open the **API Tokens** tab.
4. Click **Create Token**, then **Get started** next to *Custom token*.
5. Give it a name you'll recognize, e.g. `citizenry-deploy`.
6. Add the following permissions. For each row, the first column is
   the **scope**, the second is the **resource**, and the third is the
   **access level**:

   | Scope    | Resource           | Access |
   | -------- | ------------------ | ------ |
   | Account  | Workers Scripts    | Edit   |
   | Account  | Cloudflare Pages   | Edit   |
   | Account  | D1                 | Edit   |
   | Account  | Workers Subdomain  | Read   |

7. Under **Account Resources**, choose *Include → All accounts* (or
   restrict to a single account if you have more than one).
8. Click **Continue to summary**, then **Create Token**.
9. **Copy the token now.** Cloudflare will not show it again.

> **What if I lose the token?** No catastrophe - just create a new
> one and update the GitHub secret in [Step 4](#step-4--add-the-two-required-secrets-to-your-fork).
> The old token can be revoked from the same page.

---

## Step 3 - Find your Cloudflare Account ID

1. Go back to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Pick any account from the left sidebar (or the only one you have).
3. On the right sidebar of the account home page, look for
   **Account ID**. It's a 32-character hex string.
4. Click the copy icon next to it.

---

## Step 4 - Add the two required secrets to your fork

GitHub Secrets are encrypted values your workflow can read. They are
never exposed in logs or to forks of your fork.

1. Open your forked repository on GitHub.
2. **Settings → Secrets and variables → Actions**.
3. On the **Secrets** tab, click **New repository secret** for each row:

   | Name                    | Value                            |
   | ----------------------- | -------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | The token from Step 2.           |
   | `CLOUDFLARE_ACCOUNT_ID` | The Account ID from Step 3.      |

That's everything required. The workflow will generate every other
secret on first run.

> **Optional secrets** (you do not need them for a default deploy)
> are listed in [Reference → Secrets and variables](#secrets-and-variables).

---

## Step 5 - Run the deploy workflow

The workflow is named **Deploy to Cloudflare** and lives at
`.github/workflows/deploy.yml`.

### First-time trigger

You have two equivalent options:

- **Option A - manual.** In your fork: **Actions** tab → choose
  *Deploy to Cloudflare* in the left sidebar → click **Run workflow**
  (top-right) → leave `main` selected → **Run workflow**.
- **Option B - push.** Make any change on `main` (the README is fine)
  and push. The workflow runs automatically.

### What success looks like

Open the run. You'll see seven jobs:

```
build → provision → migrate → deploy-workers → bootstrap-secrets
                                                  ↓
                                              deploy-pages
                                                  ↓
                                              summary
```

When every job has a green checkmark, scroll to the bottom of the
**Summary** tab. You'll see a table like:

```
Service prefix: `citizenry`  ·  Subdomain: `your-handle.workers.dev`

| Service             | Type   | Default endpoint                                  |
|---------------------|--------|---------------------------------------------------|
| citizenry-migrator  | Worker | citizenry-migrator.your-handle.workers.dev        |
| citizenry-api       | Worker | citizenry-api.your-handle.workers.dev             |
| citizenry-admin-api | Worker | citizenry-admin-api.your-handle.workers.dev       |
| citizenry-mcp       | Worker | citizenry-mcp.your-handle.workers.dev             |
| citizenry-mail      | Worker | citizenry-mail.your-handle.workers.dev            |
| citizenry-admin-web | Pages  | citizenry-admin-web.pages.dev                     |
| citizenry-docs      | Pages  | citizenry-docs.pages.dev                          |
```

Copy this table somewhere - those are the URLs you'll use from now
on. (You can always re-read it from any deploy run's summary.)

### What the workflow did

In one pass it:

1. Created four D1 databases on your account
   (`citizenry-identity`, `citizenry-vault`, `citizenry-mail`,
   `citizenry-config`), or reused existing ones.
2. Applied SQL migrations to each.
3. Built and deployed five Workers and two Pages sites.
4. Generated random values for every internal secret (API service
   key, JWT signing key, refresh-token pepper, …) and the admin
   password if you didn't supply one. They are stored both in
   Cloudflare D1 (source of truth) and as Worker secrets (runtime).

Re-running the workflow is **safe and idempotent**: databases are
looked up by name, migrations are skipped if already applied, and
secrets are only rotated if you change the matching GitHub secret.

---

## Step 6 - Retrieve the admin password

On first deploy the workflow generates a 32-character random
passphrase and writes it to the `citizenry-config` database. It is
deliberately **never printed in workflow logs**. There are two ways
to retrieve it.

### Option A - Cloudflare dashboard (no tools needed)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers
   & Pages** → **D1** in the left sidebar.
2. Open `citizenry-config`.
3. Click the **Console** tab.
4. Paste and run:

   ```sql
   SELECT config_value FROM config WHERE config_key = 'admin.password';
   ```

5. The cell value is JSON-encoded - the literal contents include the
   surrounding double-quotes (e.g. `"abcd1234…"`). The actual password
   is everything **between** the quotes.

### Option B - Wrangler (command line)

If you have [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
installed and authenticated with `wrangler login`:

```bash
wrangler d1 execute citizenry-config-db --remote \
  --command="SELECT config_value FROM config WHERE config_key='admin.password';" \
  | jq -r '.[0].results[0].config_value' | jq -r .
```

The final `jq -r .` strips the JSON quotes and prints the raw password.

### Setting your own password instead

If you'd rather pick the password yourself:

1. In your fork: **Settings → Secrets and variables → Actions → New
   repository secret**.
2. Name: `ADMIN_PASSWORD`. Value: whatever you want.
3. Re-run the deploy workflow.

The next deploy overwrites the stored password with yours. To rotate
later, change the secret and redeploy, or use the admin config API
(`PUT /v1/admin/config/admin.password`).

---

## Step 7 - Sign in to the admin console

The admin console is a static site at `citizenry-admin-web.pages.dev`
(or `<your-prefix>-admin-web.pages.dev` if you customized the prefix -
see [Reference → Renaming the deployment](#renaming-the-deployment)).

1. Open `https://citizenry-admin-web.pages.dev` in a browser.
2. Sign in with:
   - **Admin ID:** `admin` (unless you set the `ADMIN_ID` variable in
     your fork - see [Reference](#secrets-and-variables)).
   - **Password:** the value you retrieved in Step 6.
3. The console is read-mostly: agent rosters, identity records,
   config keys, mail queue. Operator-only - agents themselves use
   the public API or MCP gateway, not this UI.

If you see a login error, the most common cause is leaving the
JSON-encoding quotes in the password - strip them. See
[Troubleshooting](#troubleshooting).

> **What about end-user accounts?** There aren't any. citizenry is
> agent-only; identities are created through the API. The admin
> console exists for the operator (you), not for end users.

---

## Day-to-day operations

This section is the part you'll keep coming back to.

### Pull upstream updates

The upstream project releases improvements you'll want. To pull them
into your fork:

1. On your fork's GitHub page, click **Sync fork** → **Update branch**.
2. The push to `main` triggers the deploy workflow automatically; new
   migrations and code roll out on success.

If Sync fork reports merge conflicts, clone your fork locally, resolve
the conflicts, and push. (Conflicts are usually limited to files you
edited yourself.)

### Rotate the admin password

Either:

- **Through CI:** set/replace the `ADMIN_PASSWORD` GitHub secret and
  re-run the workflow.
- **Live, no redeploy:** call the admin config API.

  ```bash
  curl -X PUT https://<admin-api>/v1/admin/config/admin.password \
    -H "Authorization: Bearer <admin access token>" \
    -H "Content-Type: application/json" \
    -d '{"value":"new-passphrase"}'
  ```

  Changes propagate after at most 5 minutes (colo-local cache TTL).

### Rotate an internal secret

The workflow stores four internal secrets in
`citizenry-identity._config`: `enrollment_pepper`, `service_key`,
`admin_jwt_secret`, `admin_refresh_pepper`. To rotate any of them:

```bash
wrangler d1 execute citizenry-identity --remote \
  --command="DELETE FROM _config WHERE key='service_key';"
```

Then re-run the deploy workflow. A fresh value is generated and
pushed to every Worker that uses it.

Alternative: set the matching GitHub secret to the new value and
redeploy. The override upserts into `_config` and propagates.

### Inspect runtime data

Either the dashboard's **D1 → Console** tab, or:

```bash
wrangler d1 execute citizenry-identity --remote \
  --command="SELECT key, value FROM _config;"
wrangler d1 execute citizenry-config-db --remote \
  --command="SELECT config_key, config_value FROM config;"
```

### Tear it all down

A separate `destroy.yml` workflow exists for cleanly removing every
Worker, Pages site, and D1 database the deploy created. Run it from
the **Actions** tab when you're done experimenting. It requires
manual confirmation - see the workflow file for the input form.

---

## Optional: enable outbound and inbound mail

The `citizenry-mail` worker deploys unconditionally, but it does
nothing useful until you connect it to a real mail path. Skip this
section entirely if you don't need mail - `GET /_health` still
responds, outbound goes to the log-only sender, and inbound never
fires because no MX records point at Cloudflare.

### Outbound - pick a provider

The mail worker tries providers in this order and uses the first that
is configured:

1. **Cloudflare Email Service.** Configure `[[send_email]]` in
   `apps/mail/wrangler.toml` and own `MAIL_DOMAIN` on Cloudflare DNS;
   SPF / DKIM / DMARC are set automatically. No credentials needed.
2. **Resend.** Set `mail.outbound.resend.api_key` in `citizenry-config`.
3. **AWS SES.** Set both `mail.outbound.aws_ses.access_key_id` and
   `mail.outbound.aws_ses.secret_access_key`.
4. **Log-only.** Fallback. Mail rows persist with
   `deliveryStatus='queued'` but nothing is sent.

Provider credentials live in `citizenry-config` and can be set
through the admin API at any time - no redeploy required:

```bash
# Resend
curl -X PUT https://<admin-api>/v1/admin/config/mail.outbound.resend.api_key \
  -H "Authorization: Bearer <admin access token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"re_xxx..."}'

# AWS SES (both lines required to activate)
curl -X PUT https://<admin-api>/v1/admin/config/mail.outbound.aws_ses.access_key_id \
  -H "Authorization: Bearer <admin access token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"AKIA..."}'
curl -X PUT https://<admin-api>/v1/admin/config/mail.outbound.aws_ses.secret_access_key \
  -H "Authorization: Bearer <admin access token>" \
  -H "Content-Type: application/json" \
  -d '{"value":"..."}'

# AWS SES optional extras:
#   mail.outbound.aws_ses.region          (default us-east-1)
#   mail.outbound.aws_ses.session_token   (STS temporary credentials)
```

Changes propagate after the 5-minute config-cache TTL. To disable a
provider, `DELETE` the same key.

### Inbound - Cloudflare Email Routing

1. Dashboard → **Email → Email Routing** for the zone that matches
   your `MAIL_DOMAIN` GitHub variable (e.g. `mail.example.com`).
2. Enable Email Routing. Cloudflare auto-suggests three MX records -
   add them to your zone.
3. Create one routing rule:
   - **Match:** `*@<your-mail-domain>` (catch-all).
   - **Action:** *Send to a Worker* → pick `citizenry-mail`.
4. Verify with a test message. The worker resolves the local-part
   against `identity.agent.slug`; unknown recipients are dropped
   silently (see [`apps/mail/src/inbound/handler.ts`](../apps/mail/src/inbound/handler.ts)).

No `wrangler.toml` block is needed - the routing rule lives only in
Cloudflare's configuration and survives redeploys.

---

## Optional: use your own domain names

The defaults are `*.workers.dev` and `*.pages.dev`, which Cloudflare
gives you for free. To attach a domain you own:

1. Make sure the zone is on your Cloudflare account.
2. **Workers & Pages** → select a project → **Custom Domains** →
   **Set up a custom domain** → enter the hostname.
3. Cloudflare issues a TLS certificate automatically (takes a minute).
4. In your fork, set the matching GitHub **variables** (not secrets):

   | Variable       | Purpose                                                      |
   | -------------- | ------------------------------------------------------------ |
   | `ISSUER_HOST`  | Identity issuer host baked into JWTs.                        |
   | `JWT_AUDIENCE` | Comma-separated audience list accepted by `api`.             |
   | `API_BASE_URL` | URL that `admin-api` proxies to. Defaults to the workers.dev URL. |
   | `MAIL_DOMAIN`  | The host used for inbound and outbound mail.                 |

5. Re-run the deploy workflow. The next deploy bakes the new host
   names into `[vars]`.

---

## Troubleshooting

| Symptom | Cause and fix |
| ------- | ------------- |
| **`Missing required secret(s): CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID`** | The first job fails fast. Add the two secrets in Step 4 and re-run. |
| **`CF ... failed: [10000] Authentication error`** | The token lacks one of the permissions listed in Step 2. Re-issue it with all four scopes (Workers Scripts, Pages, D1: Edit; Workers Subdomain: Read). |
| **Workflow's `migrate` job stalls on `migrator /status not ready`** | The migrator worker is still propagating to the edge. The workflow retries 10 times with backoff; if it ultimately fails, re-run the job. |
| **Admin login fails with the password copied from the database** | The cell value is JSON-encoded with literal `"` quotes. Strip the outer double-quotes. Pipe through `jq -r` to do it automatically. |
| **Admin login fails right after rotating the password through the API** | The 5-minute colo-local cache hasn't expired yet. Wait or re-deploy (which clears the cache). |
| **`admin-api` calls return 401** | `SERVICE_KEY` is out of sync between `api` and `admin-api`. The bootstrap step normally enforces equality; if you set the GitHub secret manually, redeploy so both workers receive the same value. |
| **A second deploy fails with `already exists`** | A previous run was interrupted mid-creation. Open the dashboard, delete the half-created resource, and re-run. The provisioner is name-based and will pick up where it left off. |
| **Local `wrangler d1 migrations apply` hangs at a confirmation prompt** | The CI workflow pipes `yes` into it. When running locally, type `y` yourself, or add `--yes`. |
| **`docs.pages.dev` shows a 404** | The docs site reads the workers.dev subdomain at deploy time. If the very first deploy failed before `deploy-pages`, re-run the whole workflow. |

If you hit something not listed here, the
[GitHub Issues page](../../../issues) of your upstream is the right
place.

---

## Reference

### Architecture being deployed

| Service                | Type    | Storage / bindings                                                          |
| ---------------------- | ------- | --------------------------------------------------------------------------- |
| `citizenry-api`        | Worker  | `DB_IDENTITY`, `DB_VAULT`, `DB_CONFIG` (all D1)                             |
| `citizenry-admin-api`  | Worker  | `DB_IDENTITY` (refresh tokens), `DB_CONFIG`, API service binding            |
| `citizenry-mcp`        | Worker  | -                                                                           |
| `citizenry-mail`       | Worker  | `DB_IDENTITY`, `DB_MAIL`, `DB_CONFIG`, MAIL binding                         |
| `citizenry-migrator`   | Worker  | `DB_IDENTITY`, `DB_VAULT`, `DB_MAIL`, `DB_CONFIG` (bearer-guarded `/apply`) |
| `citizenry-admin-web`  | Pages   | Static SvelteKit admin console (ops-only)                                   |
| `citizenry-docs`       | Pages   | Static Starlight handbook                                                   |

### Storage

- **D1 `citizenry-identity`** - identity domain. Migrations:
  `packages/identity/migrations/*.sql`. Also hosts the auto-managed
  internal secrets in the `_config` table.
- **D1 `citizenry-vault`** - vault domain. Migrations:
  `packages/vault/migrations/*.sql`.
- **D1 `citizenry-mail`** - mail domain. Migrations:
  `packages/mail/migrations/*.sql`.
- **D1 `citizenry-config`** - runtime control-plane key/value store
  for operator-managed settings. Written through admin-api
  (`/_admin/v1/admin/config/*`), read by data-plane code via
  `packages/config` with a 5-minute colo-local TTL cache. Migrations:
  `packages/config/migrations/*.sql`.

### Admin authentication model

- Operators sign in with **admin ID + password**. The default ID is
  `admin`; override it via the `ADMIN_ID` GitHub variable.
- `admin-api` issues an HS256 JWT access token (15-minute TTL) plus
  a refresh token rotated on every use. Both are signed/peppered with
  values stored in `citizenry-identity._config`
  (`admin_jwt_secret`, `admin_refresh_pepper`) and copied into
  Worker secrets on deploy.
- The admin password itself lives in `citizenry-config.admin.password`
  (JSON-encoded plaintext). On first deploy, it is auto-generated if
  unset.
- Every `/v1/admin/*` request requires a valid access token.
  `admin-api` then proxies to `api`'s `/_admin/*` over an internal
  service binding using a shared `SERVICE_KEY` PSK and an `X-Admin-Id`
  breadcrumb header. Two layers of auth keep operator credentials
  separate from inter-worker PSKs.

### Secrets and variables

Set under **Settings → Secrets and variables → Actions** on your
fork.

**Required secrets** (set in Step 4):

| Name                    | Value                                    |
| ----------------------- | ---------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token from Step 2.                   |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from Step 3.                  |

**Optional secrets** - the workflow generates a random value on
first deploy if these are unset, persists it in D1, and pushes it to
the matching Worker secret on every redeploy. Set one only if you
want to **pin or rotate** the value from your repository.

| Name                   | Stored in                                    | Used by                                      |
| ---------------------- | -------------------------------------------- | -------------------------------------------- |
| `ENROLLMENT_PEPPER`    | `citizenry-identity._config`                 | `api`                                        |
| `SERVICE_KEY`          | `citizenry-identity._config`                 | `api` and `admin-api` (same value)           |
| `ADMIN_JWT_SECRET`     | `citizenry-identity._config`                 | `admin-api` (HS256 sign/verify)              |
| `ADMIN_REFRESH_PEPPER` | `citizenry-identity._config`                 | `admin-api` (refresh-token hash pepper)      |
| `MIGRATOR_TOKEN`       | Worker secret on `citizenry-migrator`        | Bearer for the `/apply` route on the migrator |
| `ADMIN_PASSWORD`       | `citizenry-config.admin.password`            | `admin-api` (sign-in check)                  |

**Optional variables** (the **Variables** tab - not secrets - they
are written into `wrangler.toml` `[vars]` at deploy time):

| Name             | Purpose                                                                  | Example                            |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `SERVICE_PREFIX` | Resource-name prefix. Defaults to `citizenry`.                           | `acme`                             |
| `ADMIN_ID`       | Admin login ID baked into `admin-api`. Defaults to `admin`.              | `ops`                              |
| `ISSUER_HOST`    | DID issuer host written into `api`/`admin-api` `[vars] ISSUER_HOST`.     | `id.example.com`                   |
| `JWT_AUDIENCE`   | JWT audience list (comma-separated) accepted by `api`.                   | `api.id.example.com,citizenry-id`  |
| `API_BASE_URL`   | Public URL `admin-api` proxies to. Defaults to the workers.dev URL.      | `https://api.example.com`          |
| `MAIL_DOMAIN`    | Mail host for inbound (MX) and outbound (SPF/DKIM) configuration.        | `mail.example.com`                 |

### Renaming the deployment

Set the `SERVICE_PREFIX` GitHub variable to anything other than the
default. Every Worker and Pages project name becomes
`<prefix>-<service>`, and every URL follows suit. The workflow
summary always prints the resolved names - use it as your map.

### Adding D1 migrations later

Drop new SQL files into the relevant `packages/*/migrations/`
directory. Each file must be **idempotent** (use
`CREATE … IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
etc.). The next deploy applies new files via
`wrangler d1 migrations apply`, which uses a tracking table to skip
already-applied files.

### Local development

```bash
pnpm install
pnpm dev   # builds spec, then runs all apps in parallel
```

`wrangler dev` uses miniflare's local D1 and ignores the production
`database_id`. The committed `local-dev-placeholder` works as-is for
offline development. There is no local provisioning step - local
work never touches your Cloudflare account.

### Glossary

- **Worker** - Cloudflare's serverless function runtime. One worker
  per "app" in this repo.
- **Pages** - Cloudflare's static-site product. The admin console
  and docs handbook are Pages projects.
- **D1** - Cloudflare's serverless SQLite. All four databases run
  here.
- **`workers.dev` subdomain** - the free `*.workers.dev` host
  Cloudflare gives every account. Workers are reachable at
  `<worker-name>.<your-handle>.workers.dev` by default.
- **Wrangler** - Cloudflare's command-line tool. The deploy
  workflow uses it under the hood; you only need it locally for
  inspection commands.
- **MCP** - Model Context Protocol. The `mcp` worker exposes the API
  as MCP tools so agents can connect with one URL.
- **DCO sign-off** - see [`CONTRIBUTING.md`](../CONTRIBUTING.md). Only
  required if you intend to send pull requests upstream; you can
  deploy your own fork without it.
