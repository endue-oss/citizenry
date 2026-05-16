# citizenry

Spec-driven modular monolith. Domain packages mounted by protocol-specific gateways on Cloudflare Workers.

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
pnpm dev          # all apps via turbo
pnpm typecheck
```

## Deploy

Each Worker app deploys independently via `wrangler deploy` from its own directory.
