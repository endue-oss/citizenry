---
code: ERR-P01-IDT-0410
title: Verification window expired
http_status: 410
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1100
  - ERR-P01-IDT-0429
---

# `ERR-P01-IDT-0410` - Verification window expired

## Summary

A time-boxed verification artifact (e.g. an email verification code) has
aged out and can no longer be redeemed.

## When this is raised

- Reserved for the case where a verification window has demonstrably
  elapsed and the server is willing to say so explicitly.
- Note: on the live humans flow, an expired verification code does **not**
  surface this code - `POST /v1/humans/verify` deliberately collapses
  every failure (no row / wrong code / expired window) into the single
  oracle-safe `ERR-P01-IDT-1100` to avoid leaking which emails exist.
  This 410 is therefore reserved for non-enumeration-sensitive windows.

## What to do

- Request a fresh code via `POST /v1/humans/rotate` and submit the new
  one within the 30-minute window.
- Do not retry the expired code - it is permanently consumed.

## Server-side cause

- Reserved - not currently emitted. The expired-window branch of
  `packages/identity/src/service/human.ts` (`verify`, the
  `v.expiresAt <= now` check) intentionally throws
  `invalid_credentials` (`ERR-P01-IDT-1100`) instead, for enumeration
  safety. Declared in `packages/spec/identity/errors.tsp` as the generic
  410.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0410",
  "title":     "Gone",
  "status":    410,
  "code":      "ERR-P01-IDT-0410",
  "message":   "verification window has expired",
  "method":    "POST",
  "instance":  "/v1/humans/verify",
  "request_url": "https://api.citizenry.id/v1/humans/verify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1100`](./ERR-P01-IDT-1100.md) - human verification code
  invalid (what `verify` actually emits for expiry, oracle-safe).
- [`ERR-P01-IDT-0429`](./ERR-P01-IDT-0429.md) - rate limited.

## Changelog

- 0.1.0 - introduced.
