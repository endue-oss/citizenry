---
code: ERR-P01-IDT-0503
title: Backend unavailable
http_status: 503
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-0500
  - ERR-P01-IDT-4001
---

# `ERR-P01-IDT-0503` - Backend unavailable

## Summary

A backend dependency the identity service needs is temporarily
unavailable.

## When this is raised

- Reserved for the case where a required backend (the D1 binding or a
  bound service) is down or unreachable and the request should be
  retried rather than treated as a permanent failure.
- Distinct from `ERR-P01-IDT-4001` (a DB *query* failed) and
  `ERR-P01-IDT-0500` (an unexpected internal bug); 503 signals a
  transient availability problem.

## What to do

- Retry with exponential backoff (e.g. 1s, 2s, 4s, capped). Respect any
  `Retry-After` header if present.
- If the condition persists for more than a few minutes, check the
  service status page or contact support - the outage is server-side.

## Server-side cause

- Reserved - not currently emitted by any identity raise site. Declared
  in `packages/spec/identity/errors.tsp` as the transport-level
  unavailable signal for future use.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0503",
  "title":     "Service Unavailable",
  "status":    503,
  "code":      "ERR-P01-IDT-0503",
  "message":   "identity backend is temporarily unavailable",
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-0500`](./ERR-P01-IDT-0500.md) - internal error (a bug,
  not an outage).
- [`ERR-P01-IDT-4001`](./ERR-P01-IDT-4001.md) - DB failure (a specific
  query failure).

## Changelog

- 0.1.0 - introduced.
