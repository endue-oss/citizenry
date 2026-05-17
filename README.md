<div align="center">

# Endue Citizenry

**Citizenship for AI agents — yours to run.**

Give your AI agents a citizenship so they can act on their own.

Run it yourself on Cloudflare. Fully open source — no strings attached.

[![License: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-blue?style=flat-square)](./LICENSE)
&nbsp;
[![Spec: CC-BY-SA 4.0](https://img.shields.io/badge/spec-CC--BY--SA%204.0-green?style=flat-square)](./packages/spec/LICENSE)
&nbsp;
[![DCO required](https://img.shields.io/badge/DCO-required-orange?style=flat-square)](./CONTRIBUTING.md)

</div>

---

## What it is

Citizenry is an open, run-it-yourself **citizenship office** for AI
agents. You issue your own citizenships, sign them with your own keys,
and decide who counts as a citizen. No middleman. No company holding
your data. Just open standards running on Cloudflare.

## What you get

About five minutes after you start:

- A **public profile page** at `/.well-known/did.json` — your citizenry's address on the web
- A **public key page** other systems use to verify the citizenships you sign
- An **admin dashboard** for adding agents, issuing citizenships, and renewing signing keys
- A **gateway for AI agents** (MCP) so they can prove their citizenship to other tools
- An **auto-updater** that keeps the database in shape on every deploy
- **Federation** — your citizenry can recognize and trust other citizenries on terms you choose

All on **Cloudflare**. The free tier is enough to start.

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

Five things come up on your Cloudflare account: three small services,
two web sites, two databases — all set up for you during the deploy.
Full walkthrough in [`docs/deploy.md`](./docs/deploy.md).

---

## Why we built this

Identity should not be rented.

AI agents are showing up everywhere right now — millions of them,
talking to apps and to each other. The default answer is "let some
big company sign them in for you." That turns identity into a toll
gate. Toll gates get charged for, or shut down, or both.

Citizenry exists so that **anyone can run their own citizenship
office**: your team, your community, your weekend project. Different
citizenries can recognize each other on terms you choose. No central
authority, no Endue server in the middle — just the open spec we
share.

## Real open source, not the fake kind

We love open source. It is the reason most of the software you use
exists. We want this project to outlive any company — including ours.
Here is what that means in practice:

- **Apache License 2.0 for the code.** A real, OSI-approved open
  source license — not a workalike. You can use it, change it, share
  it, host it as a service, and make money from it.
  ([`LICENSE`](./LICENSE))
- **CC-BY-SA 4.0 for the specification.** If you build on the
  protocol, your version stays open too.
  ([`packages/spec/LICENSE`](./packages/spec/LICENSE))
- **No paperwork that signs your rights away.** Contributors keep
  their copyright. We use only the
  [Developer Certificate of Origin](https://developercertificate.org/) —
  the one-line sign-off the Linux kernel uses.
  ([`CONTRIBUTING.md`](./CONTRIBUTING.md))
- **No bait-and-switch later.** Apache 2.0 is what we shipped, and
  that is what we will keep shipping. No quiet switch to a
  "mostly-open" license (BUSL, SSPL, "fair-code"). No commercial-only
  modules sneaked in. Every release we have already made stays
  Apache 2.0 forever.
- **Public RFC process for big changes.** Anyone can read; anyone can
  propose. ([`docs/rfcs/`](./docs/rfcs/))
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

`wrangler dev` runs locally — no Cloudflare account needed.

## Documentation

| | |
|---|---|
| Full deploy guide | [`docs/deploy.md`](./docs/deploy.md) |
| How to contribute | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Project governance | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| Proposals (RFCs) | [`docs/rfcs/`](./docs/rfcs/) |
| Past decisions (ADRs) | [`docs/adr/`](./docs/adr/) |
| Code of Conduct | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |
| Report a security issue | [`SECURITY.md`](./SECURITY.md) |
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
