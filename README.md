<div align="center">
<<<<<<< Updated upstream
<img width="64" height="64" alt="citizenry_moonlit_pearl_transparent" src="https://github.com/user-attachments/assets/cb33274f-1cf3-4b09-aded-e08306556cfe" />
=======

<img width="64" height="64" alt="Citizenry" src="https://raw.githubusercontent.com/endue-oss/.github/main/logo/citizenry-dark.svg" />
>>>>>>> Stashed changes
<a href="https://github.com/endue-ai"><img src="https://raw.githubusercontent.com/endue-ai/.github/main/logo/endue-ai-logo-dark.svg" alt="Endue AI" height="64" /></a>


# Endue Citizenry


**Citizenship for AI agents - yours to run.**

Give your AI agents a citizenship so they can act on their own.

Run it yourself on Cloudflare. Fully open source. No strings attached.

[![License: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-blue?style=flat-square)](./LICENSE)
&nbsp;
[![Spec: CC-BY-SA 4.0](https://img.shields.io/badge/spec-CC--BY--SA%204.0-green?style=flat-square)](./packages/spec/LICENSE)
&nbsp;
[![DCO required](https://img.shields.io/badge/DCO-required-orange?style=flat-square)](./CONTRIBUTING.md)

</div>

---

## What it is

Citizenry is an **identity provider** for AI agents - one you stand
up yourself. You issue the identities, you sign them with your own
keys, you decide who counts as a citizen. No middleman.

Agents are the only citizens. There is no end-user website to log
into; the service is run from a small admin console, and agents prove
who they are over the wire.

Stand it up on Cloudflare in about five minutes.

## What you get

About five minutes after you start, your instance is live:

- A **public DID document** at `/.well-known/did.json` - where other systems look up who you are
- A **JWKS endpoint** anyone can fetch to verify the identities you sign
- An **admin console** for onboarding humans, issuing identities, and rotating your signing keys
- A **public agent surface** so agents can present their identity to other tools they visit
- A **migrations runner** that keeps the schema in shape on every deploy
- **Federation** - your instance can recognize and trust other citizenries on terms you choose

Cloudflare hosts everything. The free tier is enough to get started.

---

## Deploy your own Citizenry

Three clicks, five minutes, no terminal.

### Step 1

[![Step 1 - Fork this repo](https://img.shields.io/badge/Step%201-Fork%20this%20repo-2563eb?style=for-the-badge&logo=github&logoColor=white)](https://github.com/endue-oss/citizenry/fork)

Creates your own copy under your GitHub account. You'll also get
GitHub's "Sync fork" button for pulling future upstream updates.

### Step 2

[![Step 2 - Add Cloudflare secrets](https://img.shields.io/badge/Step%202-Add%20Cloudflare%20secrets-f38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/settings/secrets/actions/new)

In your new repo, *Settings → Secrets and variables → Actions → New
repository secret*. Add two:

- `CLOUDFLARE_API_TOKEN` - scoped token. [Scoping guide](./docs/deploy.md#step-2-create-a-scoped-cloudflare-api-token).
- `CLOUDFLARE_ACCOUNT_ID` - from your Cloudflare dashboard sidebar.

### Step 3

[![Step 3 - Run deploy](https://img.shields.io/badge/Step%203-Run%20deploy-22c55e?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/YOUR_USERNAME/citizenry/actions/workflows/deploy.yml)

In your new repo, *Actions → Deploy to Cloudflare → Run workflow*.
Or push any commit to `main`.

> Buttons in steps 2 and 3 use a `YOUR_USERNAME` placeholder. After
> step 1, replace it in the URL bar with your GitHub username, or just
> navigate within your new repo.

A handful of things come up on your Cloudflare account: a few small
services, an admin console, and two databases - all set up for you
during the deploy.
Full walkthrough in [`docs/deploy.md`](./docs/deploy.md).

---

## Connect your agents

Your instance is live. Onboard your first agents:

1. **Sign in as admin.** Either through the admin console at
   `citizenry-admin-web.pages.dev`, or by calling `citizenry-admin-api`
   directly with your admin ID and password.
   ([Retrieving the admin password](./docs/deploy.md#retrieving-the-admin-password))
2. **Verify a human** and pick up the resulting API-Key (`chk_…`). The
   key is returned once and also delivered by email.
3. **Register an agent** by `POST /v1/agent/register` with that
   API-Key. The agent receives its own credentials and is now a citizen.
4. **The agent calls** `citizenry-api` (REST) or `citizenry-mcp` (MCP
   gateway) using those credentials.

Endpoint shapes live in [`packages/spec/`](./packages/spec/) (TypeSpec → OpenAPI).
Full walkthrough in [`docs/deploy.md`](./docs/deploy.md).

---

## Why we built this

Identity should not be rented.

AI agents are showing up everywhere right now - millions of them,
talking to apps and to each other. The default answer is "let some
big company sign them in for you." That turns identity into a toll
gate. Toll gates get charged for, or shut down, or both.

Citizenry exists so that **anyone can run their own identity
provider**: your team, your community, your weekend project.

And no instance stands above another. Two citizenries can recognize
each other the way two countries do - by reading each other's JWKS,
on terms each side sets. There is no central authority, no Endue
server in the middle. Just the open spec we share, and the keys you
control.

## Real open source, not the fake kind

We love open source. It is the reason most of the software you use
exists. We want this project to outlive any company - including ours.
Here is what that means in practice:

- **Apache License 2.0 for the code.** A real, OSI-approved open
  source license - not a workalike. You can use it, change it, share
  it, host it as a service, and make money from it.
  ([`LICENSE`](./LICENSE))
- **CC-BY-SA 4.0 for the specification.** If you build on the
  protocol, your version stays open too.
  ([`packages/spec/LICENSE`](./packages/spec/LICENSE))
- **No paperwork that signs your rights away.** Contributors keep
  their copyright. We use only the
  [Developer Certificate of Origin](https://developercertificate.org/) -
  the one-line sign-off the Linux kernel uses.
  ([`CONTRIBUTING.md`](./CONTRIBUTING.md))
- **No bait-and-switch later.** Apache 2.0 is what we shipped, and
  that is what we will keep shipping. No quiet switch to a
  "mostly-open" license (BUSL, SSPL, "fair-code"). No commercial-only
  modules sneaked in. Every release we have already made stays
  Apache 2.0 forever.
- **Public RFC process for big changes.** Anyone can read; anyone can
  propose. ([`docs/reference/rfcs/`](./docs/reference/rfcs/))
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
  admin-web/    admin SvelteKit → Cloudflare Pages (ops console)

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

`wrangler dev` runs locally - no Cloudflare account needed.

## Documentation

| | |
|---|---|
| Full deploy guide | [`docs/deploy.md`](./docs/deploy.md) |
| How to contribute | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Project governance | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| Proposals (RFCs) | [`docs/reference/rfcs/`](./docs/reference/rfcs/) |
| Past decisions (ADRs) | [`docs/reference/adr/`](./docs/reference/adr/) |
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
