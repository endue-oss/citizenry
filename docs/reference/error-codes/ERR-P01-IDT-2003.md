---
code: ERR-P01-IDT-2003
title: Tenant invalid
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2002
  - ERR-P01-IDT-3110
---

# `ERR-P01-IDT-2003` - Tenant invalid

## Summary

The `tenant` slug on the register request resolves to no known tenant.

## When this is raised

- On `POST /v1/agent/register`, the requested `tenant` slug (defaulting
  to `public` when omitted) matches no row in the `tenant` table.
- The agent is granted exactly one tenant membership at registration, so
  an unresolvable tenant aborts the whole registration.

## What to do

- Pass a `tenant` slug that exists in this deployment, or omit the field
  to accept the default `public` tenant.
- If you believe the tenant should exist, an operator must seed it
  first.

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` - `register`
  (tenant resolution).
- Guard: `if (!tenantRow) throw new RegisterError('tenant_invalid',
  \`unknown tenant: ${tenantSlug}\`)`; mapped to
  `IDENTITY_ERR.tenant_invalid` (422) in
  `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2003",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2003",
  "message":   "unknown tenant: staging",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2002`](./ERR-P01-IDT-2002.md) - slug invalid.
- [`ERR-P01-IDT-3110`](./ERR-P01-IDT-3110.md) - slug taken.

## Changelog

- 0.1.0 - introduced.
