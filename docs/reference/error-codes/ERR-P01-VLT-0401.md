---
code: ERR-P01-VLT-0401
title: Unauthorized
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1001
  - ERR-P01-IDT-1003
---

# `ERR-P01-VLT-0401` - Unauthorized

## Summary

The vault handler ran without an authenticated agent principal.

## When this is raised

- A vault agent-surface route (`GET`/`POST`/`DELETE /vault/entries…`)
  executed but no verified agent JWT subject (`sub`) was present on the
  request context.
- In normal operation this is a **defensive catch-all**: the shared
  `apps/api` auth middleware verifies the agent JWT *before* the vault
  router runs, and a failed verification emits an identity (`IDT`) code,
  not this one. This code only surfaces if the principal is somehow absent
  past that gate.
- It does not distinguish *why* the principal is missing - there is no
  existence oracle and no per-cause detail.

## What to do

- Present a valid `Authorization: Bearer <agent-JWT>` minted per the agent
  enrollment flow and retry.
- If you received an identity (`IDT`) code instead, fix the token per that
  code's page - that is the authoritative auth failure surface.
- If you hold a valid token and still see this code, it indicates a gateway
  wiring problem; contact the operator.

## Server-side cause

- Raised by: `packages/vault/src/router/index.ts` - the
  `if (!owner) { … }` guard at the top of each agent route
  (`ownerOf(c)` returns `c.var.agentJwtPayload?.sub ?? null`).
- Guard: emits `401 / VAULT_ERR.unauthorized` with `agent jwt required`
  whenever no subject is bound to the context.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0401",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-VLT-0401",
  "message":   "agent jwt required",
  "method":    "GET",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1001`](./ERR-P01-IDT-1001.md) - JWT alg mismatch, emitted by
  the upstream identity verifier.
- [`ERR-P01-IDT-1003`](./ERR-P01-IDT-1003.md) - JWT expired, emitted by the
  upstream identity verifier.

## Changelog

- 0.1.0 - introduced.
