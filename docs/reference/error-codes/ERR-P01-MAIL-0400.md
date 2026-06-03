---
code: ERR-P01-MAIL-0400
title: Bad Request
http_status: 400
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-0401
  - ERR-P01-MAIL-2001
---

# `ERR-P01-MAIL-0400` - Bad Request

## Summary

The request body sent to `/_internal/notify` was not valid JSON.

## When this is raised

- A privileged caller posts to `/_internal/notify` with a body that
  `c.req.json()` cannot parse (truncated, empty, or non-JSON payload).
- It is a transport-level catch-all: the bytes never become a structured
  request, so no template, recipient, or field validation is even attempted.
- Distinct from `ERR-P01-MAIL-2001`, which fires when the JSON *parses* but
  fails the bearer `POST /mails` schema.

## What to do

- Send a well-formed JSON object with a `Content-Type: application/json`
  body. Verify the payload is not truncated by a proxy or service binding.
- This is always a caller bug; the body is rejected before any side effect,
  so retrying the identical bytes will fail identically.

## Server-side cause

- Raised by: `apps/mail/src/internal/notify.ts` - the `POST /_internal/notify`
  handler, in the `try { body = await c.req.json() } catch { ... }` block.
- Guard: the `catch` returns `400` with `code: MAIL_ERR.bad_request` and the
  message `request body must be valid JSON`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0400",
  "title":     "Bad Request",
  "status":    400,
  "code":      "ERR-P01-MAIL-0400",
  "message":   "request body must be valid JSON",
  "method":    "POST",
  "instance":  "/_internal/notify",
  "request_url": "https://mail.citizenry.id/_internal/notify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-0401`](./ERR-P01-MAIL-0401.md) - the service-key guard on the
  same `/_internal/*` surface, checked before the body is parsed.
- [`ERR-P01-MAIL-2001`](./ERR-P01-MAIL-2001.md) - body parses as JSON but
  fails the `POST /mails` schema.

## Changelog

- 0.1.0 - introduced.
