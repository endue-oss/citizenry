---
code: ERR-P01-VLT-0503
title: Backend Unavailable
http_status: 503
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-4001
  - ERR-P01-VLT-0500
---

# `ERR-P01-VLT-0503` - Backend Unavailable

## Summary

The vault's storage backend (D1) is temporarily unavailable.

## When this is raised

- **Reserved - not currently emitted.** The vault does not distinguish a
  transient backend outage from other failures at this time. D1 errors
  surface as a generic `500` (`internal_error`) via the `apps/api` error
  handler, not as this `503`.
- It is declared so that a future health/availability guard can return a
  retryable `503` (with `Retry-After`) instead of a terminal `500` when D1
  is unreachable or degraded.

## What to do

- Treat `503` as retryable. Back off and retry with exponential delay and
  jitter; honour `Retry-After` when present.
- If the condition persists beyond a few minutes, report it to the
  operator - it indicates a backend outage, not a client error.
- No request changes are needed; the same request should succeed once the
  backend recovers.

## Server-side cause

- Reserved - no raise site exists. There is no D1 availability probe that
  emits `503` in `packages/vault/src/router/index.ts` or the vault service
  today; backend failures currently bubble to
  `apps/api/src/middleware/error.ts` as a `500`.
- Guard: none yet. A future availability guard would emit `503 /
  VAULT_ERR.unavailable`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0503",
  "title":     "Backend Unavailable",
  "status":    503,
  "code":      "ERR-P01-VLT-0503",
  "message":   "vault backend temporarily unavailable",
  "method":    "GET",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-4001`](./ERR-P01-VLT-4001.md) - a specific D1 query failure
  (vs. the backend being unreachable as a whole).
- [`ERR-P01-VLT-0500`](./ERR-P01-VLT-0500.md) - the terminal internal-error
  surface that backend failures currently fall through to.

## Changelog

- 0.1.0 - introduced.
