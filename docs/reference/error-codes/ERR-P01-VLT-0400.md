---
code: ERR-P01-VLT-0400
title: Bad Request
http_status: 400
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-2001
  - ERR-P01-VLT-0413
---

# `ERR-P01-VLT-0400` - Bad Request

## Summary

The request body could not be parsed as JSON.

## When this is raised

- A `POST /vault/entries` request carries a body that is not well-formed
  JSON (for example, a truncated payload, a trailing comma, or a non-JSON
  content stream).
- Raised before any field-level validation - the parser never produces a
  value to inspect.
- A syntactically valid JSON body that is merely missing or has an empty
  `data` field is **not** this code; that is `ERR-P01-VLT-2001`.

## What to do

- Serialize the body with a conforming JSON encoder and resend.
- Ensure the request actually contains a body and that any client-side
  framing (chunking, compression) is correct.
- This is always a client-side framing error; the server inspected nothing.

## Server-side cause

- Raised by: `packages/vault/src/router/index.ts` - `POST /entries`
  handler.
- Guard: the `try { await c.req.json() } catch { … }` block that wraps body
  parsing emits `400 / VAULT_ERR.bad_request` on any parse failure.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0400",
  "title":     "Bad Request",
  "status":    400,
  "code":      "ERR-P01-VLT-0400",
  "message":   "body must be valid JSON",
  "method":    "POST",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-2001`](./ERR-P01-VLT-2001.md) - body parsed but failed
  field validation (missing or empty `data`).
- [`ERR-P01-VLT-0413`](./ERR-P01-VLT-0413.md) - body parsed but the `data`
  blob exceeds the size cap.

## Changelog

- 0.1.0 - introduced.
