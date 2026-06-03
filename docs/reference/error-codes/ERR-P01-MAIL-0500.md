---
code: ERR-P01-MAIL-0500
title: Internal Error
http_status: 500
category: invariant
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-4001
  - ERR-P01-MAIL-0503
---

# `ERR-P01-MAIL-0500` - Internal Error

## Summary

The mail service hit an unexpected internal failure while handling the
request.

## When this is raised

- An unhandled exception escaped a mail handler - anything that is not a
  recognised `MailError` (which carries its own code and status).
- The router's `.onError` catch-all wraps such an error as
  `MAIL.internal('unexpected error')` and renders a `500`.
- A `500` carries no actionable detail by design; the cause is logged
  server-side, never echoed to the caller.

## What to do

- Retry once after a short delay; transient failures may clear.
- If it persists, capture the `timestamp` and `request_url` and report them
  to the operator - the matching server log holds the real cause.
- Do not parse the message for branching logic; it is opaque and may change.

## Server-side cause

- Raised by: `packages/mail/src/router/index.ts` - the `mailRouter.onError`
  handler. When `err` is not an `instanceof MailError`, it constructs
  `const internal = MAIL.internal('unexpected error')` and returns `500`.
- Guard: the `else` branch of the `onError` handler; recognised `MailError`
  instances are rendered with their own status instead.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0500",
  "title":     "Internal Server Error",
  "status":    500,
  "code":      "ERR-P01-MAIL-0500",
  "message":   "unexpected error",
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-4001`](./ERR-P01-MAIL-4001.md) - an outbound provider
  failure, a specific external cause (vs. an unclassified internal one).
- [`ERR-P01-MAIL-0503`](./ERR-P01-MAIL-0503.md) - backend unavailable, the
  retryable transport-level counterpart.

## Changelog

- 0.1.0 - introduced.
