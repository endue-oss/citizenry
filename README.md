<div align="center">

# Endue Citizenry

**Self-host the identity layer for the agent web.**

Issue DIDs, mint JWTs, and verify AI agents on your own Cloudflare
account — open protocols, Apache 2.0, no rug-pulls.

[![License: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-blue?style=flat-square)](./LICENSE)
&nbsp;
[![Spec: CC-BY-SA 4.0](https://img.shields.io/badge/spec-CC--BY--SA%204.0-green?style=flat-square)](./packages/spec/LICENSE)
&nbsp;
[![DCO required](https://img.shields.io/badge/DCO-required-orange?style=flat-square)](./CONTRIBUTING.md)

</div>

---

## What it is

Citizenry is an open, self-hostable **identity issuer** for AI agents
and the people who run them. You operate your own
`did:web:yourhost`, sign JWTs with your own keys, and decide who counts
as a citizen. No SaaS in the middle. No vendor lock-in. Just open
protocols (DID, JWT, JWKS) running on a Cloudflare Worker.

## What you get

After about five minutes of deploy:

- A **DID issuer** at `https://yourhost/.well-known/did.json`
- A **public JWKS** endpoint that anyone can verify against
- An **admin API + web** to enroll agents, mint citizenships, and rotate keys
- An **MCP gateway** so AI agents can authenticate using their citizenship
- A **migrator Worker** that applies schema updates idempotently on every deploy
- **Federation** built in — your issuer can trust other citizenry instances on terms you choose

All on **Cloudflare Workers + D1**. The free tier is enough to start.

---

## Deploy your own

Three steps. About five minutes end-to-end.

### Step 1

[![Step 1 — Fork this repo](https://img.shields.io/badge/Step%201-Fork%20this%20repo-2563eb?style=for-the-badge&logo=github&logoColor=white)](https://github.com/endue-oss/citizenry/fork)

Creates your own copy under your GitHub account. You'll also get
GitHub's "Sync fork" button for pulling future upstream updates.

### Step 2

[![Step 2 — Add Cloudflare secrets](https://img.shields.io/badge/Step%202-Add%20Cloudflare%20secrets-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/settings/secrets/actions/new)

In your new repo, *Settings → Secrets and variables → Actions → New
repository secret*. Add three:

- `CLOUDFLARE_API_TOKEN` — scoped token. [Scoping guide](./docs/deploy.md#step-2-create-a-scoped-cloudflare-api-token).
- `CLOUDFLARE_ACCOUNT_ID` — from your Cloudflare dashboard sidebar.
- `IDENTITY_DATABASE_URL` — any reachable Postgres. Neon and Supabase free tiers work.

### Step 3

[![Step 3 — Run deploy](https://img.shields.io/badge/Step%203-Run%20deploy-22c55e?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/actions/workflows/deploy.yml)

In your new repo, *Actions → Deploy to Cloudflare → Run workflow*.
Or push any commit to `main`.

> Buttons in steps 2 and 3 use a `YOUR_USERNAME` placeholder. After
> step 1, replace it in the URL bar with your GitHub username, or just
> navigate within your new repo.

Five services come up: three Workers, two Pages projects, all bound
to two D1 databases provisioned for you mid-deploy. Full walkthrough
in [`docs/deploy.md`](./docs/deploy.md).

---

## Why we built this

Identity should not be rented.

The agent web is being built right now — LLM-driven actors are
showing up at APIs and at each other by the millions, and the default
answer is "let a third party authenticate them for you." That makes
identity a chokepoint, and chokepoints get monetized, censored, or
both.

Citizenry exists so that **anyone can run an identity authority**:
your team, your community, your weekend project. Federation lets these
authorities trust each other on terms they pick. There is no Endue
server in the middle — the spec is the only thing we ship together.

## Real open source, not the fake kind

We love open source. It is the reason most of the software you use
exists, and we want this project to outlive any company, including
ours. So here are our commitments — in code rather than rhetoric:

- **Apache License 2.0 for the code.** OSI-approved, permissive. You
  can use, modify, distribute, host as a service, and commercialize it
  freely. ([`LICENSE`](./LICENSE))
- **CC-BY-SA 4.0 for the specification.** The protocol is share-alike;
  derivatives stay open. ([`packages/spec/LICENSE`](./packages/spec/LICENSE))
- **No CLA.** Contributors keep their copyright. We use only the
  [Developer Certificate of Origin](https://developercertificate.org/),
  the same lightweight sign-off the Linux kernel uses.
  ([`CONTRIBUTING.md`](./CONTRIBUTING.md))
- **No future relicense.** Apache 2.0 is what shipped, and that is
  what will keep shipping — no BUSL, no SSPL, no "fair-code"
  reframing, no surprise commercial-only modules. The license cannot
  be silently changed, and every prior release stays Apache 2.0
  forever.
- **Public RFC process for everything material.** Anyone can read;
  anyone can propose. ([`docs/rfcs/`](./docs/rfcs/))
- **Trademark only on the name itself**, narrowly. Forks may use the
  name to describe what they are; they may not claim to *be* official
  Endue Citizenry. ([`TRADEMARKS.md`](./TRADEMARKS.md))

If you read a clause and it feels like a trick, please
[open an issue](https://github.com/endue-oss/citizenry/issues). Bad
faith would betray why we wrote this in the first place.

---

## Layout

```
apps/
  api/          public API Worker (citizenry-api)
  admin-api/    admin API Worker
  mcp/          MCP gateway
  migrator/     migration Worker
  web/          user-facing SvelteKit → Cloudflare Pages
  admin-web/    admin SvelteKit → Cloudflare Pages

packages/
  spec/         TypeSpec → OpenAPI 3 + zod + types
  identity/     auth domain
  vault/        vault domain
```

## Dev

```bash
pnpm install
pnpm dev          # spec build → all apps in parallel
pnpm typecheck
```

Local `wrangler dev` uses miniflare; no Cloudflare provisioning is
needed for development.

## Documentation

| | |
|---|---|
| Full adopter deploy walkthrough | [`docs/deploy.md`](./docs/deploy.md) |
| Contributing & DCO sign-off | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Governance and decision-making | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| RFC process for spec changes | [`docs/rfcs/`](./docs/rfcs/) |
| Architectural decisions | [`docs/adr/`](./docs/adr/) |
| Code of Conduct | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |
| Security disclosure | [`SECURITY.md`](./SECURITY.md) |
| Trademark policy | [`TRADEMARKS.md`](./TRADEMARKS.md) |

## Conformance & Partnership

- **Conformance program** (use of the "Endue Citizenry Certified" mark): `team@endue.ai`
- **Hosting / cloud partner program**: `team@endue.ai`
- **Trademark questions**: `team@endue.ai`

---

<div align="center">

**[endue.ai](https://endue.ai)** · `team@endue.ai`

Copyright 2026 Endue · Apache 2.0 (code) · CC-BY-SA 4.0 (spec)

</div>
