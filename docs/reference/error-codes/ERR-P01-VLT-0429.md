---
code: ERR-P01-VLT-0429
title: Rate Limited
http_status: 429
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-0503
---

# `ERR-P01-VLT-0429` - Rate Limited

## Summary

The caller has exceeded an allowed request rate against the vault.

## When this is raised

- **Reserved - not currently emitted.** The vault router does not enforce a
  rate limit at this layer; no code path produces this code today.
- It is declared in the catalog so that a future per-principal or
  per-colo rate limiter can adopt the code without a breaking catalog
  change.
- When implemented, it would be raised once a caller crosses a configured
  request budget within a window.

## What to do

- Treat `429` as retryable. Back off and retry with exponential delay
  (and jitter), honouring any `Retry-After` header once one is emitted.
- Reduce request concurrency or batch reads where possible.
- If you never expect to hit a limit and see this code, contact the
  operator - the budget may be misconfigured.

## Server-side cause

- Reserved - no raise site exists. There is no rate-limiting guard in
  `packages/vault/src/router/index.ts` or the vault service at this time.
- Guard: none yet. A future limiter would emit `429 /
  VAULT_ERR.rate_limited`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0429",
  "title":     "Rate Limited",
  "status":    429,
  "code":      "ERR-P01-VLT-0429",
  "message":   "rate limit exceeded",
  "method":    "GET",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-0503`](./ERR-P01-VLT-0503.md) - backend unavailable, the
  other retryable condition (also currently reserved).

## Changelog

- 0.1.0 - introduced.
