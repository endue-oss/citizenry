# Endue Citizenry

Spec-driven modular monolith. Domain packages mounted by protocol-specific
gateways on Cloudflare Workers.

## Layout

```
apps/
  api/          public API (Cloudflare Worker)
  admin-api/    admin API (Cloudflare Worker)
  mcp/          MCP gateway (Cloudflare Worker)
  web/          user web (SvelteKit)
  admin-web/    admin web (SvelteKit)

packages/
  spec/         TypeSpec → OpenAPI/types/zod (internal SSoT)
  identity/     auth domain (D1 / Hyperdrive)
  vault/        vault domain (D1 / Hyperdrive)
```

## Dev

```bash
pnpm install
pnpm dev          # spec build → all apps in parallel
pnpm typecheck
```

## Deploy your own

[![1. Fork this repo](https://img.shields.io/badge/1.-Fork%20this%20repo-2563eb?style=for-the-badge&logo=github&logoColor=white)](https://github.com/endue-oss/citizenry/fork)
&nbsp;
[![2. Add Cloudflare secrets](https://img.shields.io/badge/2.-Add%20Cloudflare%20secrets-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/settings/secrets/actions/new)
&nbsp;
[![3. Run deploy](https://img.shields.io/badge/3.-Run%20deploy-22c55e?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/actions/workflows/deploy.yml)

Three steps from a fresh GitHub account to a running deployment:

1. **Fork this repo** — creates your own copy under your account.
   GitHub redirects you to it. (You'll also get a "Sync fork" button to
   pull upstream updates later.)
2. **Add Cloudflare secrets** — in your new repo, *Settings → Secrets
   and variables → Actions → New repository secret*. Add three:
   - `CLOUDFLARE_API_TOKEN` — scoped Cloudflare API token ([scoping
     guide](./docs/deploy.md#step-2-create-a-scoped-cloudflare-api-token))
   - `CLOUDFLARE_ACCOUNT_ID`
   - `IDENTITY_DATABASE_URL` — any reachable Postgres
     (Neon / Supabase free tiers work)
3. **Run deploy** — in your new repo, *Actions → Deploy to Cloudflare
   → Run workflow*. Or push any commit to `main`.

> Buttons 2 and 3 use a `YOUR_USERNAME` placeholder. After step 1,
> replace it in the URL bar with your GitHub username, or just navigate
> within your new repo.

Full walkthrough — optional secrets, custom domains, migration model:
[`docs/deploy.md`](./docs/deploy.md).

For local one-off deploys, each Worker app can also be shipped
independently via `wrangler deploy` from its own directory.

## License

- **Source code**: [Apache License 2.0](./LICENSE)
- **Specification** (`packages/spec/`):
  [CC-BY-SA 4.0](./packages/spec/LICENSE)
- **Attribution**: see [NOTICE](./NOTICE)

The Apache 2.0 license is permissive — you may use, modify, distribute,
and offer this software as a service, including commercially, subject to
the license terms (notably, retaining `LICENSE` and `NOTICE`).

The specification is share-alike: derivative specifications must be
released under the same license.

## Trademarks

**Endue**, **Endue Citizenry**, and **Citizenry** are trademarks of
Endue. The Apache 2.0 license does **not** grant trademark rights.

You may freely use the Citizenry name to describe your use of the
software (e.g., *"Powered by Endue Citizenry"*, *"Compatible with Endue
Citizenry"*), but you may not use it in product, company, or service
names without permission. Forks must be renamed.

See the full [Trademark Policy](./TRADEMARKS.md) and the
[Conformance Program](./GOVERNANCE.md#5-endue-citizenry-conformance-program)
for certified-compatibility marks.

## Governance

The project is stewarded by Endue, with an RFC process for
specification changes and a Steering Committee for project-level
decisions. See [GOVERNANCE.md](./GOVERNANCE.md).

## Contributing

We welcome contributions. All commits require a
[Developer Certificate of Origin](https://developercertificate.org/)
sign-off (`git commit -s`). See [CONTRIBUTING.md](./CONTRIBUTING.md).

Participants in project spaces follow our
[Code of Conduct](./CODE_OF_CONDUCT.md) (Contributor Covenant v2.1).

## Security

For security vulnerabilities, please **do not** open public issues.
See [SECURITY.md](./SECURITY.md) for the responsible disclosure
process.

## Conformance & Partnership

- **Conformance program** (use of the "Endue Citizenry Certified" mark):
  `team@endue.ai`
- **Hosting / cloud partner program**: `team@endue.ai`
- **Trademark questions**: `team@endue.ai`

---

Copyright 2026 Endue. Licensed under Apache 2.0 (code) and CC-BY-SA 4.0
(spec).
