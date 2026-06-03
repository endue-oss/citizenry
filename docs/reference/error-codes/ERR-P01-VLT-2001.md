---
code: ERR-P01-VLT-2001
title: Invalid Body
http_status: 400
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-0400
  - ERR-P01-VLT-0413
---

# `ERR-P01-VLT-2001` - Invalid Body

## Summary

The `POST /vault/entries` body parsed as JSON but failed field validation.

## When this is raised

- A create request's `data` field is absent, `null`, not a string, or an
  empty string. `data` must be a non-empty RFC 7516 JWE string.
- The body itself parsed cleanly as JSON - only the field shape is wrong.
  A body that is not valid JSON yields `ERR-P01-VLT-0400` instead.
- The vault treats `data` as opaque ciphertext: it checks presence,
  type, and emptiness here, but does **not** validate JWE structure.

## What to do

- Send a JSON object with a `data` property whose value is a non-empty
  JWE compact-serialization string.
- Verify the field name is exactly `data` and that it is not nested under
  another key.
- This is a client-side input error; correct the body and resend.

## Server-side cause

- Raised by: `packages/vault/src/router/index.ts` - `POST /entries`
  handler.
- Guard: `if (!isNonEmptyString(body.data)) { … }`, where
  `isNonEmptyString` is `typeof v === 'string' && v.length > 0`; emits
  `400 / VAULT_ERR.invalid_body`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-2001",
  "title":     "Invalid Body",
  "status":    400,
  "code":      "ERR-P01-VLT-2001",
  "message":   "data is required (a non-empty RFC 7516 JWE string)",
  "method":    "POST",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-0400`](./ERR-P01-VLT-0400.md) - body could not be parsed as
  JSON at all (earlier in the same handler).
- [`ERR-P01-VLT-0413`](./ERR-P01-VLT-0413.md) - `data` present and valid but
  over the size cap (later in the same handler).

## Changelog

- 0.1.0 - introduced.
