---
code: ERR-P01-VLT-4001
title: Database Failure
http_status: 502
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-0500
  - ERR-P01-VLT-0503
---

# `ERR-P01-VLT-4001` - Database Failure

## Summary

A D1 query backing a vault operation failed.

## When this is raised

- **Reserved - not currently emitted.** The vault repo issues D1 queries
  (`packages/vault/src/repo/entry.ts`) but does not wrap their failures in
  a code-bearing error. A failed D1 query throws, propagates to the
  `apps/api` global error handler, and surfaces as a generic `500`
  (`internal_error`) rather than as `ERR-P01-VLT-4001`.
- It is declared so a future repo-level guard can classify D1 query errors
  as an external-dependency failure distinct from an unexpected internal
  invariant violation (`0500`).

## What to do

- Treat as retryable. Retry once after a short backoff; D1 transient errors
  often clear immediately.
- If it persists, report the `timestamp` and `request_url` to the operator
  - the server log holds the underlying D1 error.
- No request changes are needed; the body and auth were already accepted.

## Server-side cause

- Reserved - no raise site emits this code. D1 queries live in
  `packages/vault/src/repo/entry.ts` (e.g. `findById`, `create`,
  `listByOwnerPage`); their rejections are not caught and re-coded, so they
  currently fall through to `apps/api/src/middleware/error.ts` as a `500`.
- Guard: none yet. A future repo-level wrapper would emit `502 /
  VAULT_ERR.db_failure`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-4001",
  "title":     "Database Failure",
  "status":    502,
  "code":      "ERR-P01-VLT-4001",
  "message":   "vault storage query failed",
  "method":    "POST",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-0500`](./ERR-P01-VLT-0500.md) - the generic internal-error
  surface D1 failures currently fall through to.
- [`ERR-P01-VLT-0503`](./ERR-P01-VLT-0503.md) - backend unreachable as a
  whole (vs. a single query failing).

## Changelog

- 0.1.0 - introduced.
