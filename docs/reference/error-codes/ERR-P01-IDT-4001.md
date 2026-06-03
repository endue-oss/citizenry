---
code: ERR-P01-IDT-4001
title: DB failure
http_status: 502
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-0500
  - ERR-P01-IDT-0503
---

# `ERR-P01-IDT-4001` - DB failure

## Summary

A query against the identity datastore failed.

## When this is raised

- Reserved for a failed read/write against the identity D1 database
  (`citizenry-identity`) - e.g. a query error or a transient backend
  fault surfaced as an external-dependency failure.
- Distinct from `ERR-P01-IDT-0500` (an unexpected internal bug) and
  `ERR-P01-IDT-0503` (the backend is wholly unavailable); 4001 is a
  specific query-level failure against a reachable database.

## What to do

- Retry once after a short delay - many D1 failures are transient.
- If it recurs, capture the `timestamp` / `instance` and contact
  support; this is a server-side dependency problem, not a payload
  issue.

## Server-side cause

- Reserved - not currently emitted by any identity raise site. Database
  errors today propagate as unhandled exceptions that surface as the
  generic 500. Declared in `packages/spec/identity/errors.tsp` as the
  identity DB-failure signal for when query errors are wrapped
  explicitly.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-4001",
  "title":     "Bad Gateway",
  "status":    502,
  "code":      "ERR-P01-IDT-4001",
  "message":   "identity datastore query failed",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-0500`](./ERR-P01-IDT-0500.md) - internal error (an
  unexpected bug).
- [`ERR-P01-IDT-0503`](./ERR-P01-IDT-0503.md) - backend unavailable.

## Changelog

- 0.1.0 - introduced.
