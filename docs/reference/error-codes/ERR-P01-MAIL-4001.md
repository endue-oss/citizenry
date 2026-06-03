---
code: ERR-P01-MAIL-4001
title: Send Failed
http_status: 502
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-0429
  - ERR-P01-MAIL-0503
---

# `ERR-P01-MAIL-4001` - Send Failed

## Summary

An outbound provider (Cloudflare Mail / Resend / SES / Google) returned an
error while dispatching the message.

## When this is raised

- `POST /mails` accepted the body and resolved a From address, but
  `sendMail(...)` threw while handing the message to the configured outbound
  provider chain.
- The audit row has already been persisted with `deliveryStatus = 'failed'`
  before the error is re-coded, so the attempt is recorded server-side.
- The underlying provider message is surfaced verbatim as the envelope
  `message`, so it can name the failing provider or reason.
- This is the bearer `POST /mails` surface. The `/_internal/notify` route
  takes a different shape: it always returns `202` and records the outcome in
  the log row's `status`, so it does not emit this code.

## What to do

- Treat `502` as retryable. Retry once after a short backoff with jitter;
  many provider errors (timeouts, transient 5xx) clear on retry.
- If it persists, inspect the `message` for the provider's reason and check
  the operator's outbound-provider credentials and `mail.outbound.priority`
  configuration.
- A persistent failure across all configured providers indicates a
  provider-side or credential problem, not a request bug.

## Server-side cause

- Raised by: `packages/mail/src/router/index.ts` - the `POST /mails` handler,
  in the `catch` around `sendMail(...)`: `throw MAIL.sendFailed(err instanceof
  Error ? err.message : String(err))`.
- Guard: any rejection from `sendMail` / the provider chain in
  `apps/mail/src/outbound/*` (`cloudflare`, `resend`, `ses`, `google`,
  `fallback`); the row is persisted as `failed` first, then a `502` is
  surfaced.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-4001",
  "title":     "Bad Gateway",
  "status":    502,
  "code":      "ERR-P01-MAIL-4001",
  "message":   "resend: 422 domain is not verified",
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-0429`](./ERR-P01-MAIL-0429.md) - a provider/limiter
  rate-limit signal, the other external-dependency failure (reserved).
- [`ERR-P01-MAIL-0503`](./ERR-P01-MAIL-0503.md) - the mail backend
  unavailable as a whole (vs. a single send failing).

## Changelog

- 0.1.0 - introduced.
