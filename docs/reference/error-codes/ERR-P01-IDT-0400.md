---
code: ERR-P01-IDT-0400
title: Bad request
http_status: 400
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2001
  - ERR-P01-IDT-2002
---

# `ERR-P01-IDT-0400` - Bad request

## Summary

The request body or query could not be parsed, or a required top-level
field is missing or the wrong type.

## When this is raised

- The request body is not valid JSON (e.g. `POST /v1/agent/register` or
  `POST /v1/humans` with a truncated or non-JSON payload).
- A required scalar is absent or has the wrong primitive type before any
  domain validation runs - e.g. `slug` missing on register, `email` not a
  string on `POST /v1/humans`.
- The catch-all for malformed transport that does not yet reach the
  schema validators (2xxx) or business rules (3xxx).

## What to do

- Send a well-formed JSON body with the documented required fields. Check
  `Content-Type: application/json` and that the body is not empty.
- This is always a client-side mistake; do not retry the identical
  request - fix the payload first.

## Server-side cause

- Raised by: `packages/identity/src/router/register.ts` (JSON parse guard
  and the `slug is required` guard) and
  `packages/identity/src/router/humans.ts` (`email is required` /
  non-JSON body, mapped from `HumanError('email_invalid')`).
- Guard: `try { body = await c.req.json() } catch { … }` and the
  subsequent `typeof body.<field> !== 'string'` checks.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0400",
  "title":     "Bad Request",
  "status":    400,
  "code":      "ERR-P01-IDT-0400",
  "message":   "request body must be valid JSON",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2001`](./ERR-P01-IDT-2001.md) - JWK invalid (a more
  specific schema failure once the body parses).
- [`ERR-P01-IDT-2002`](./ERR-P01-IDT-2002.md) - slug pattern violation.

## Changelog

- 0.1.0 - introduced.
