---
code: ERR-P01-IDT-1042
title: API-Key expired
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1040
  - ERR-P01-IDT-1041
  - ERR-P01-IDT-1043
---

# `ERR-P01-IDT-1042` - API-Key expired

## Summary

The presented human API-Key was recognised and active, but is past its
`expires_at`.

## When this is raised

- The `chk_…` token resolves to a row with a non-null `expires_at` whose
  time is at or before now.
- Keys minted by the standard verify flow currently have `expires_at =
  null` (non-expiring); this code applies to keys issued with an explicit
  expiry.

## What to do

- Mint a fresh API-Key via the verify flow (`POST /v1/humans/verify`)
  and switch to it.
- If your credential should not expire, issue it without an expiry; do
  not paper over expiry by retrying the same expired token.

## Server-side cause

- Raised by: `packages/identity/src/service/api_key.ts` - `verify`.
- Guard: `if (row.expiresAt && row.expiresAt.getTime() <= tNow.getTime())
  throw new ApiKeyError('api_key_expired', 'this key has expired')`,
  mapped to `IDENTITY_ERR.api_key_expired` in
  `apps/api/src/middleware/auth.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1042",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1042",
  "message":   "this key has expired",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1040`](./ERR-P01-IDT-1040.md) - API-Key invalid.
- [`ERR-P01-IDT-1041`](./ERR-P01-IDT-1041.md) - API-Key revoked.
- [`ERR-P01-IDT-1043`](./ERR-P01-IDT-1043.md) - owner human not active.

## Changelog

- 0.1.0 - introduced.
