# Endue Citizenry — Agent guide

Operational guide for agents (Claude Code, etc.) working in this
repository. Human contributors should start with
[`README.md`](./README.md) and [`CONTRIBUTING.md`](./CONTRIBUTING.md);
this file supplements those with conventions specific to automated
contributors.

## Language

**English only, everywhere in this repository.** That includes:

- Source code, identifiers, comments
- Commit messages (subject and body)
- Pull request titles and descriptions
- Issue titles and bodies
- ADRs, RFCs, error-code pages, design docs, READMEs
- TypeSpec, OpenAPI, JSDoc, and any other inline documentation

Non-English text is acceptable only in transient, off-repo
communication (e.g. chat with maintainers). It must never enter a
repository artifact. When in doubt, write English.

## Project structure

```
apps/
  api/          public API Worker (citizenry-api)        — D1 vault + D1 identity, mounts /_admin/* under SERVICE_KEY
  admin-api/    admin API Worker (citizenry-admin-api)   — HTTP proxy to api /_admin/* (SERVICE_KEY)
  mcp/          MCP gateway Worker (citizenry-mcp)
  migrator/     migration Worker (citizenry-migrator)    — bearer-guarded /apply against both D1 databases
  admin-web/    admin SvelteKit → Cloudflare Pages (ops-only console; agents use api/mcp directly)

packages/
  spec/         TypeSpec → OpenAPI 3 + zod + types (internal source of truth)
  identity/     auth domain — D1 (citizenry-identity)
  vault/        vault domain — D1 (citizenry-vault)

docs/
  adr/          accepted architectural decisions
  rfcs/         proposed specification changes
  error-codes/  per-code public catalog pages
  deploy.md     adopter deployment walkthrough

scripts/ci/
  provision.mjs          list-or-create D1 databases via Cloudflare REST API
  render-wrangler.mjs    patch placeholder database_id into wrangler.toml at CI time
  bootstrap-secrets.sh   read or generate values in D1 `_config`, push to Worker secrets
  deploy-pages.sh        wrangler pages deploy for the SvelteKit Pages apps

templates/
  adr.md, rfc.md, error-code.md — scaffolds used by the `/docs create` skill

.github/workflows/
  ci.yml        typecheck + lint + tests on PR
  deploy.yml    production deploy to Cloudflare on push to main
```

## Secrets model

Two Worker secrets are auto-managed — operators never need to touch them:

| Secret              | Source of truth                              | Used by                |
| ------------------- | -------------------------------------------- | ---------------------- |
| `ENROLLMENT_PEPPER` | D1 `citizenry-identity._config('enrollment_pepper')` | `apps/api`            |
| `SERVICE_KEY`       | D1 `citizenry-identity._config('service_key')`       | `apps/api`, `apps/admin-api` (same value) |

`scripts/ci/bootstrap-secrets.sh` runs every deploy: reads `_config`,
generates a random value on first run, and pushes to the matching
Worker secrets. Operators can override by setting the same-named
GitHub secret, which upserts into `_config` and propagates.

Inspect from CF anytime:

```bash
wrangler d1 execute citizenry-identity --remote \
  --command="SELECT key, value FROM _config;"
```

Runtime config (operator-managed, set via admin-api `PUT
/v1/admin/config/:key`) lives in the **config D1**:

| Key                                       | Used by      | Notes |
| ----------------------------------------- | ------------ | ----- |
| `admin.password`                          | `apps/admin-api` | Bootstrap-seeded; rotate via admin-api or by re-deploying with `ADMIN_PASSWORD`. |
| `mail.outbound.resend.api_key`            | `apps/mail`  | Activates Resend (priority 2). |
| `mail.outbound.aws_ses.access_key_id`     | `apps/mail`  | Activates SES (priority 3) when paired with `secret_access_key`. |
| `mail.outbound.aws_ses.secret_access_key` | `apps/mail`  | — |
| `mail.outbound.aws_ses.region`            | `apps/mail`  | Optional, defaults to `us-east-1`. |
| `mail.outbound.aws_ses.session_token`     | `apps/mail`  | Optional, for STS assumed-role / temporary credentials. |
| `identity.allowed_email_domains`          | `apps/api` (humans flow) | JSON array of lowercase hosts permitted on `POST /v1/humans`. Defaults baked into `packages/identity/src/service/human.ts` (`DEFAULT_ALLOWED_EMAIL_DOMAINS`) if the key is unset. |

Reads are wrapped by `packages/config`'s `withTtlCache` (5-min
colo-local). Changes propagate after the TTL elapses; no redeploy.

## Where to look first

| Task | Read first |
|---|---|
| Add a deploy step or change Cloudflare resources | [`docs/adr/2026-0002.md`](./docs/adr/2026-0002.md) — why deploy works this way |
| Mint or document an error code | [`docs/error-codes/guideline.md`](./docs/error-codes/guideline.md) — scheme, slug registry, HTTP status table |
| Propose a specification change | [`docs/rfcs/README.md`](./docs/rfcs/README.md) — RFC process |
| Write code or open a PR | [`CONTRIBUTING.md`](./CONTRIBUTING.md) — DCO sign-off, licensing |
| Adopter-side fork-and-deploy | [`docs/deploy.md`](./docs/deploy.md) |
| Project governance | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| Code of conduct | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |
| Security disclosure | [`SECURITY.md`](./SECURITY.md) |
| Trademark policy | [`TRADEMARKS.md`](./TRADEMARKS.md) |

Accepted ADRs are the canonical source for "why is the codebase shaped
this way." Browse [`docs/adr/`](./docs/adr/) before proposing
architectural changes.

## Commits

- **DCO sign-off is required.** Use `git commit -s`. See
  [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full text and rationale.
- **English-only** subject and body (see Language above).
- One logical change per commit. Prefer a new commit over `--amend`
  once a commit has been pushed.
- Reference issue numbers in the body when applicable; keep the subject
  imperative and under ~70 characters.

## Dev loop

```bash
pnpm install
pnpm dev          # builds packages/spec, then runs all apps in parallel
pnpm typecheck
```

Local `wrangler dev` uses miniflare and ignores the
`local-dev-placeholder` `database_id` committed in `wrangler.toml`.
There is no local provisioning step.

## Deploy

Production deploys run through `.github/workflows/deploy.yml`. The
committed `wrangler.toml` files always carry placeholder D1 IDs;
resolution happens in CI. **Never commit a real `database_id`** — see
[`docs/adr/2026-0002.md`](./docs/adr/2026-0002.md) for the full
rationale.
