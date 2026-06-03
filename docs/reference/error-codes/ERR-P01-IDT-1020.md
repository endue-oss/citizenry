---
code: ERR-P01-IDT-1020
title: Service key invalid
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-0401
---

# `ERR-P01-IDT-1020` - Service key invalid

## Summary

The pre-shared service key (`X-Service-Key`) presented to an internal
`/_admin/*` route is missing or wrong.

## When this is raised

- A call to `/_admin/*` (proxied by `apps/admin-api`) carries no
  `X-Service-Key`, or a value that does not match the Worker's
  configured `SERVICE_KEY`.
- The comparison is constant-time (XOR diff) to avoid leaking the key
  via timing.

## What to do

- This is an internal trust boundary - only `apps/admin-api` should be
  calling `/_admin/*`. Ensure the caller forwards the correct
  `X-Service-Key` (sourced from the auto-managed `SERVICE_KEY` secret).
- External clients have no business on these routes; use the public
  `/v1/*` surface instead.

## Server-side cause

- Reserved code - the live `serviceKeyAuth` guard currently emits the
  generic `ERR-P01-IDT-0401` (`unauthorized`) rather than this dedicated
  PSK code. See `apps/api/src/middleware/auth.ts` - `serviceKeyAuth`,
  `if (!expected || !safeEqual(provided, expected)) return
  unauthorized(…)`. Declared in `packages/spec/identity/errors.tsp` for
  when the guard is specialised.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1020",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1020",
  "message":   "admin service key invalid or missing",
  "method":    "GET",
  "instance":  "/_admin/v1/admin/agents",
  "request_url": "https://api.citizenry.id/_admin/v1/admin/agents",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-0401`](./ERR-P01-IDT-0401.md) - unauthorized (the generic
  code the guard emits today).

## Changelog

- 0.1.0 - introduced.
