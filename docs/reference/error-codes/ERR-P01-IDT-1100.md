---
code: ERR-P01-IDT-1100
title: Verification code invalid
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-0429
  - ERR-P01-IDT-0410
---

# `ERR-P01-IDT-1100` - Verification code invalid

## Summary

The email verification code submitted to `POST /v1/humans/verify` did
not validate.

## When this is raised

- The presented `code` does not match the stored peppered hash for the
  email.
- There is no human row for the email, or no live verification row.
- The verification window has expired.

All three failure modes deliberately collapse into this single code so
the endpoint cannot be used as an email-existence oracle - the response
is identical whether or not the email exists.

## What to do

- Re-check the 6-digit code from the verification email and resubmit.
- If the code may have expired (30-minute window), request a fresh one
  via `POST /v1/humans/rotate`, then submit the new code.
- The comparison is constant-time; there is no partial-match signal to
  exploit.

## Server-side cause

- Raised by: `packages/identity/src/service/human.ts` - `verify`
  (no-row, no-verification, expired, and hash-mismatch branches all
  throw `HumanError('invalid_credentials')`), mapped to
  `IDENTITY_ERR.human_verification_code_invalid` in
  `packages/identity/src/router/humans.ts`.
- Guard: `if (!constantTimeEqual(presented, v.codeHash)) throw new
  HumanError('invalid_credentials', 'verification failed')` (and the
  preceding lookup/expiry guards).

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1100",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1100",
  "message":   "verification failed",
  "method":    "POST",
  "instance":  "/v1/humans/verify",
  "request_url": "https://api.citizenry.id/v1/humans/verify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-0429`](./ERR-P01-IDT-0429.md) - rate limited (the same
  endpoint's throttle).
- [`ERR-P01-IDT-0410`](./ERR-P01-IDT-0410.md) - verification window
  expired (the non-oracle-safe alternative, reserved).

## Changelog

- 0.1.0 - introduced.
