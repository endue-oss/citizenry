---
code: ERR-P01-VLT-0500
title: Internal Error
http_status: 500
category: invariant
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-4001
  - ERR-P01-VLT-0503
---

# `ERR-P01-VLT-0500` - Internal Error

## Summary

The vault hit an unexpected internal failure while handling the request.

## When this is raised

- An unhandled exception escaped a vault handler (anything other than the
  recognised `VaultError('not_found')`, which becomes `404`).
- **Note on the current surface:** the vault router does not itself emit
  this code string. Unhandled errors propagate to the `apps/api` global
  error handler, which today responds `500` with a generic
  `{ "code": "internal_error" }` envelope rather than
  `ERR-P01-VLT-0500`. This code is the catalog's reserved slot for the
  vault's internal-failure class; align the api error handler to it when
  per-service 500 envelopes are introduced.
- A `500` carries no actionable detail by design - the cause is logged
  server-side, never echoed to the caller.

## What to do

- Retry once after a short delay; transient failures may clear.
- If it persists, capture the `timestamp` and `request_url` and report it
  to the operator - the matching server log holds the real cause.
- Do not parse the message for branching logic; it is opaque and may
  change.

## Server-side cause

- Surfaced by: `apps/api/src/middleware/error.ts` - the global
  `errorHandler`, which logs `err` and returns `500`. Wired via
  `app.onError(errorHandler)` in `apps/api/src/index.ts`.
- Guard: the catch-all handler; the vault router re-throws any non
  `not_found` `VaultError` and any unexpected error up to this layer.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0500",
  "title":     "Internal Error",
  "status":    500,
  "code":      "ERR-P01-VLT-0500",
  "message":   "internal error",
  "method":    "POST",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-4001`](./ERR-P01-VLT-4001.md) - a D1 query failure, a
  specific external cause that currently also surfaces as a generic 500.
- [`ERR-P01-VLT-0503`](./ERR-P01-VLT-0503.md) - backend unavailable, the
  retryable transport-level counterpart.

## Changelog

- 0.1.0 - introduced.
