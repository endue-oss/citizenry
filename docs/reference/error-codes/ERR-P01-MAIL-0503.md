---
code: ERR-P01-MAIL-0503
title: Service Unavailable
http_status: 503
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-0500
  - ERR-P01-MAIL-4001
---

# `ERR-P01-MAIL-0503` - Service Unavailable

## Summary

A backend the mail service depends on is unreachable.

## When this is raised

- **Reserved - not currently emitted.** No handler in
  `packages/mail/src/router/index.ts` or the mail service produces this code
  today.
- It is declared (and wired as `MAIL.unavailable` in
  `packages/mail/src/errors.ts`) so a future readiness or dependency-health
  guard can signal "the mail backend (D1, or all outbound providers) is down
  as a whole" - distinct from a single send failing (`4001`) or an
  unclassified internal error (`0500`).
- When implemented, it would be raised when a required dependency is
  unavailable before the request can be meaningfully processed.

## What to do

- Treat `503` as retryable. Back off and retry with exponential delay and
  jitter; the condition is expected to be transient.
- If it persists, report the `timestamp` and `request_url` to the operator -
  the dependency outage is visible in the server logs and platform status.
- No request changes are needed; the body and auth were already accepted.

## Server-side cause

- Reserved - no raise site emits this code. `MAIL.unavailable` is defined in
  `packages/mail/src/errors.ts` but is not thrown by any handler.
- Guard: none yet. A future dependency-health check would emit `503 /
  MAIL_ERR.unavailable`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0503",
  "title":     "Service Unavailable",
  "status":    503,
  "code":      "ERR-P01-MAIL-0503",
  "message":   "mail backend unavailable",
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-0500`](./ERR-P01-MAIL-0500.md) - an unclassified internal
  failure (vs. a known dependency being unreachable).
- [`ERR-P01-MAIL-4001`](./ERR-P01-MAIL-4001.md) - a single outbound send
  failing at a provider (vs. the backend being down as a whole).

## Changelog

- 0.1.0 - introduced.
