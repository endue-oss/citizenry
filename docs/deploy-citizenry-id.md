# Deploy the canonical citizenry.id

This runbook is for the **upstream maintainer** binding the production
instance to the apex domain **citizenry.id**. Adopters running a fork on
`*.pages.dev` / `*.workers.dev` do not need it — see
[Deploy your own citizenry](./deploy.md), whose
[Optional: use your own domain names](./deploy.md#optional-use-your-own-domain-names)
section is the generic version of these steps.

DNS and Cloudflare dashboard actions here must be performed by a human
with access to the `citizenry.id` zone and the Cloudflare account — they
are **not** part of the CI workflow. The repository changes that support
this (the docs `site` origin, the marketing-copy hosts) are already in
place; what remains is binding domains and re-running the deploy so the
Workers bake in the production hostnames.

---

## Prerequisites

1. The zone **citizenry.id** is added to the same Cloudflare account the
   deploy workflow uses (so Pages/Workers custom-domain binding can create
   DNS records automatically).
2. A successful default deploy has already run, so these projects exist:
   `citizenry-docs` and `citizenry-admin-web` (Pages); `citizenry-api`,
   `citizenry-mail`, `citizenry-admin-api`, `citizenry-mcp`,
   `citizenry-migrator` (Workers). See
   [Deploy your own citizenry → Step 5](./deploy.md#step-5---run-the-deploy-workflow).

---

## Hostname map

| Hostname | Backed by | Cloudflare product |
|---|---|---|
| `citizenry.id` (apex) | `citizenry-docs` | Pages — landing + handbook + API reference |
| `api.citizenry.id` | `citizenry-api` | Worker — agent-facing API |
| `mail.citizenry.id` | `citizenry-mail` | Worker — mail (JMAP/SMTP/inbound) |
| `admin.citizenry.id` (optional) | `citizenry-admin-web` | Pages — operator console |
| `mcp.citizenry.id` (optional) | `citizenry-mcp` | Worker — MCP gateway |

This handbook's `site` origin is already set to `https://citizenry.id`
([`apps/docs/astro.config.mjs`](../apps/docs/astro.config.mjs)), so the
sitemap and canonical URLs are correct once the apex is bound.

---

## Decide the identity issuer host first

> **This is a decision, not a default — settle it before binding domains,
> because it is baked into every agent DID and is effectively permanent.**

An agent's identity is a `did:web`. By the did:web rules, the DID host
must serve `/.well-known/did.json` and `/agent/{id}/did.json` — and those
paths are served by the **identity API Worker**, not by the docs Pages
site. Since the apex `citizenry.id` is bound to the docs site above, the
apex cannot also be the issuer host unless you route those well-known
paths to the API Worker.

Two clean options:

- **Recommended — issuer on a subdomain.** Set `ISSUER_HOST=api.citizenry.id`
  (or a dedicated `id.citizenry.id`). Agent DIDs become
  `did:web:api.citizenry.id:agent:ag_…`, resolving to
  `https://api.citizenry.id/agent/ag_…/did.json` — which the API Worker
  actually serves. The apex stays purely the docs/landing site.
- **Apex issuer.** Keep `did:web:citizenry.id` (matches the marketing copy
  in [`apps/docs/src/citizenry-id/products.ts`](../apps/docs/src/citizenry-id/products.ts)).
  This requires the apex to serve the identity well-known paths, i.e. a
  Cloudflare routing rule that sends `citizenry.id/.well-known/*` and
  `citizenry.id/agent/*` to `citizenry-api` while everything else goes to
  the docs Pages site. More moving parts; only choose this if the bare-apex
  DID is a hard branding requirement.

The steps below assume the **recommended** option. If you choose the apex
issuer, add the routing rule and set `ISSUER_HOST=citizenry.id`.

---

## Step 1 — Bind the apex to the docs site

1. Cloudflare dashboard → **Workers & Pages** → **citizenry-docs** →
   **Custom domains** → **Set up a custom domain**.
2. Enter `citizenry.id`. Cloudflare creates the apex DNS record (CNAME,
   flattened at the apex) and issues a TLS certificate (about a minute).
3. (Optional) Repeat for `www.citizenry.id`, then add a redirect rule
   `www.citizenry.id/* → https://citizenry.id/$1` (301) under
   **Rules → Redirect Rules**.
4. Verify: `curl -sI https://citizenry.id/ | head -n1` returns `200`, and
   the page is the Citizenry landing.

---

## Step 2 — Bind the Worker subdomains

For each Worker: **Workers & Pages → <worker> → Settings → Domains &
Routes → Add → Custom Domain**.

1. `citizenry-api` → `api.citizenry.id`
2. `citizenry-mail` → `mail.citizenry.id`
3. (optional) `citizenry-mcp` → `mcp.citizenry.id`
4. (optional) `citizenry-admin-web` (Pages) → `admin.citizenry.id`

Each binding auto-creates the DNS record and certificate. Verify the API:
`curl -s https://api.citizenry.id/_health` → `{"service":"citizenry-api","status":"ok"}`.

---

## Step 3 — Bake the production hosts into the Workers

Set these GitHub **Variables** (Settings → Secrets and variables →
Actions → **Variables**, not Secrets) on the upstream repo, then re-run
the deploy workflow so they land in each Worker's `[vars]`:

| Variable | Value (recommended option) |
|---|---|
| `ISSUER_HOST` | `api.citizenry.id` |
| `JWT_AUDIENCE` | `api.citizenry.id,citizenry-id` |
| `API_BASE_URL` | `https://api.citizenry.id` |
| `MAIL_DOMAIN` | `citizenry.id` (or `mail.citizenry.id` if mailboxes are sub-domained) |

> `JWT_AUDIENCE` must include the value agents put in their JWT `aud`. The
> `api` verifier rejects a token whose `aud` is not in this list
> ([`packages/identity/src/auth.ts`](../packages/identity/src/auth.ts)), so
> publish the chosen audience in the agent onboarding docs.

After the redeploy, confirm an agent DID resolves:
`curl -s https://api.citizenry.id/.well-known/did.json` (issuer doc) and
`https://api.citizenry.id/agent/<id>/did.json` (per-agent).

---

## Step 4 — Mail DNS (only if sending/receiving mail)

Follow [Deploy → Optional: enable outbound and inbound mail](./deploy.md#optional-enable-outbound-and-inbound-mail)
for the chosen `MAIL_DOMAIN`: add the provider's SPF/DKIM/DMARC records
and, for inbound, the Cloudflare Email Routing MX records plus a catch-all
rule to the `citizenry-mail` Worker.

---

## Known gaps at launch

These are tracked elsewhere and do **not** block the apex binding, but set
expectations:

- **Per-agent JWKS / DID routes return empty stubs.** The services support
  dual keys, but the mounted routes in
  [`packages/identity/src/router/index.ts`](../packages/identity/src/router/index.ts)
  are not yet wired (see [ADR-2026-0006](./reference/adr/2026-0006.md)). An
  agent can encrypt to its own vault key (received at registration), but
  third-party encrypt-to-agent is not live until these routes are wired.
- **Federation is disabled.** `/.well-known/citizenry-peer`,
  `/federation/handshake`, and `/v1/admin/federation/*` return `501` until
  instance federation signing keys ship; `/.well-known/jwks.json` returns
  `{ "keys": [] }` (see [ADR-2026-0003](./reference/adr/2026-0003.md)).
- **MCP gateway is a stub.** `mcp.citizenry.id` responds but registers no
  tools yet — bind it only when the gateway lands.

---

## Verification checklist

- [ ] `https://citizenry.id/` serves the landing page (200).
- [ ] `https://citizenry.id/handbook/deploy/` and the ADR/RFC/error-code
      sidebar sections render (not empty).
- [ ] `https://api.citizenry.id/_health` returns the API health JSON.
- [ ] An agent JWT minted with `aud` in `JWT_AUDIENCE` is accepted by
      `api.citizenry.id`.
- [ ] The deploy summary table reflects the custom domains.
