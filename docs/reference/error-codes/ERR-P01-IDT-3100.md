---
code: ERR-P01-IDT-3100
title: Email already in use
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2004
  - ERR-P01-IDT-1100
---

# `ERR-P01-IDT-3100` - Email already in use

## Summary

`POST /v1/humans` was called with an email that already has a row.

## When this is raised

- A `human` row already exists for the (normalised, lowercased) email on
  `POST /v1/humans`, which is fresh-email-only.
- Re-mailing a code to an existing row is a different operation:
  `POST /v1/humans/rotate` handles both pending and active rows and is
  oracle-safe (always 202).

## What to do

- To re-trigger verification for an existing email, call
  `POST /v1/humans/rotate` instead of `POST /v1/humans`.
- If you did not expect the email to exist, it was registered earlier;
  use the rotate + verify flow to obtain a fresh API-Key.

## Server-side cause

- Raised by: `packages/identity/src/service/human.ts` - `startCreate`.
- Guard: `if (existing[0]) throw new HumanError('email_already_in_use',
  …)`; mapped to `IDENTITY_ERR.human_email_already_in_use` (409) in
  `packages/identity/src/router/humans.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-3100",
  "title":     "Conflict",
  "status":    409,
  "code":      "ERR-P01-IDT-3100",
  "message":   "a row for this email already exists",
  "method":    "POST",
  "instance":  "/v1/humans",
  "request_url": "https://api.citizenry.id/v1/humans",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2004`](./ERR-P01-IDT-2004.md) - email domain not allowed.
- [`ERR-P01-IDT-1100`](./ERR-P01-IDT-1100.md) - verification code invalid.

## Changelog

- 0.1.0 - introduced.
