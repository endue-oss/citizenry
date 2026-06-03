---
code: ERR-P01-MAIL-0429
title: Too Many Requests
http_status: 429
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-4001
  - ERR-P01-MAIL-0503
---

# `ERR-P01-MAIL-0429` - Too Many Requests

## Summary

The caller has exceeded an allowed request rate against the mail service.

## When this is raised

- **Reserved - not currently emitted.** The mail router does not enforce a
  rate limit at this layer; no code path produces this code today.
- It is declared in the catalog (and wired as `MAIL.rateLimited` in
  `packages/mail/src/errors.ts`) so a future per-principal or per-colo
  limiter, or an outbound-provider quota signal, can adopt it without a
  breaking catalog change.
- When implemented, it would fire once a caller crosses a configured request
  budget within a window, or when a provider reports a `429`.

## What to do

- Treat `429` as retryable. Back off with exponential delay and jitter, and
  honour any `Retry-After` header once one is emitted.
- Reduce send concurrency or batch where possible.
- If you never expect to hit a limit and see this code, contact the operator
  - the budget may be misconfigured.

## Server-side cause

- Reserved - no raise site emits this code. `MAIL.rateLimited` is defined in
  `packages/mail/src/errors.ts` but is not thrown by any handler in
  `packages/mail/src/router/index.ts` or the mail service.
- Guard: none yet. A future limiter would emit `429 / MAIL_ERR.rate_limited`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0429",
  "title":     "Too Many Requests",
  "status":    429,
  "code":      "ERR-P01-MAIL-0429",
  "message":   "rate limit exceeded",
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-4001`](./ERR-P01-MAIL-4001.md) - an outbound provider error,
  the other external-dependency failure on the send path.
- [`ERR-P01-MAIL-0503`](./ERR-P01-MAIL-0503.md) - backend unavailable, the
  other retryable condition (also currently reserved).

## Changelog

- 0.1.0 - introduced.
