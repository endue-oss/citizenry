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

## Deploy

The included GitHub Actions workflow (`.github/workflows/deploy.yml`)
provisions Cloudflare resources, runs migrations (D1 + Postgres), and
deploys all five apps. After forking, set three repository secrets —
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `IDENTITY_DATABASE_URL`
— and push to `main` (or run the workflow manually).

See [`docs/deploy.md`](./docs/deploy.md) for the full walkthrough,
including token scoping, optional secrets, custom domains, and the
migration model.

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
  `conformance@citizenry.dev`
- **Hosting / cloud partner program**: `partners@citizenry.dev`
- **Trademark questions**: `trademarks@citizenry.dev`

---

Copyright 2026 Endue. Licensed under Apache 2.0 (code) and CC-BY-SA 4.0
(spec).
