---
code: ERR-P01-IDT-0429
title: Rate limited
http_status: 429
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1100
  - ERR-P01-IDT-0410
---

# `ERR-P01-IDT-0429` - Rate limited

## Summary

The caller exceeded the per-email or per-IP request budget on the
unauthenticated humans flow.

## When this is raised

- A request to `POST /v1/humans`, `POST /v1/humans/rotate`, or
  `POST /v1/humans/verify` trips one of the sliding-window caps: 2 per
  minute or 15 per day, evaluated independently for the `email` bucket
  and the `ip` bucket.
- The IP bucket keys on `CF-Connecting-IP` (the trusted Cloudflare edge
  header), falling back to `x-real-ip` / `x-forwarded-for` only in local
  dev.

## What to do

- Back off and retry after the delay advertised in the `Retry-After`
  response header (seconds).
- Do not loop tightly on `/verify` - each attempt counts against the cap
  and will push the window further out.

## Server-side cause

- Raised by: `packages/identity/src/router/humans.ts` -
  `enforceRateLimit`, evaluated before each humans handler runs.
- Guard: `if (!decision.allowed) { c.header('Retry-After', …); return
  c.json({ code: IDENTITY_ERR.rate_limited, … }, 429) }`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0429",
  "title":     "Too Many Requests",
  "status":    429,
  "code":      "ERR-P01-IDT-0429",
  "message":   "rate limit exceeded (email / per_minute)",
  "method":    "POST",
  "instance":  "/v1/humans/verify",
  "request_url": "https://api.citizenry.id/v1/humans/verify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1100`](./ERR-P01-IDT-1100.md) - human verification code
  invalid (the success-path sibling on `/verify`).
- [`ERR-P01-IDT-0410`](./ERR-P01-IDT-0410.md) - verification window
  expired.

## Changelog

- 0.1.0 - introduced.
