---
code: ERR-P01-IDT-0500
title: Internal error
http_status: 500
category: invariant
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-4001
  - ERR-P01-IDT-0503
---

# `ERR-P01-IDT-0500` - Internal error

## Summary

An unexpected server-side failure that the caller cannot fix - the
identity service's catch-all 500.

## When this is raised

- A domain error reaches a router whose mapping table has no entry for
  it, so the envelope falls back to `IDENTITY_ERR.internal` with status
  500.
- On `POST /v1/humans/verify`, the code is accepted but the subsequent
  API-Key issue fails - an "impossible" state the service surfaces as
  500 so the cause is investigatable rather than silently masked as 401.
- Any other unhandled exception path within the identity workers.

## What to do

- Retry once after a short delay; the failure may be transient.
- If it persists, capture the `timestamp` and `instance` and contact
  support - this is a server-side bug or outage, not a payload problem.

## Server-side cause

- Raised by: `packages/identity/src/router/humans.ts` (the
  `ERR_CODE_BY_CODE[…] ?? IDENTITY_ERR.internal` fallback and the
  "verify succeeded but api-key issue failed" branch) and
  `packages/identity/src/router/register.ts` (the `ERR_CODE[…] ??
  IDENTITY_ERR.internal` fallback).
- Guard: the `?? IDENTITY_ERR.internal` default in each envelope builder.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0500",
  "title":     "Internal Server Error",
  "status":    500,
  "code":      "ERR-P01-IDT-0500",
  "message":   "verify succeeded but api-key issue failed: owner missing",
  "method":    "POST",
  "instance":  "/v1/humans/verify",
  "request_url": "https://api.citizenry.id/v1/humans/verify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-4001`](./ERR-P01-IDT-4001.md) - DB failure (a specific
  external cause).
- [`ERR-P01-IDT-0503`](./ERR-P01-IDT-0503.md) - backend unavailable.

## Changelog

- 0.1.0 - introduced.
