---
code: ERR-P01-IDT-1041
title: API-Key revoked
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1040
  - ERR-P01-IDT-1042
  - ERR-P01-IDT-1043
---

# `ERR-P01-IDT-1041` - API-Key revoked

## Summary

The presented human API-Key was recognised but has been revoked.

## When this is raised

- The `chk_…` token resolves to a `human_api_key` row whose `status` is
  `revoked`.
- A key is revoked explicitly (admin / self revoke) or implicitly when
  the owner verifies again - `POST /v1/humans/verify` mints a fresh key
  and atomically revokes the prior active one ("single active key per
  human").

## What to do

- Stop using the revoked token. Obtain the current key from the most
  recent `POST /v1/humans/verify` response.
- If you did not expect the revocation, re-run the verify flow to mint a
  new key; the old one will never be reactivated.

## Server-side cause

- Raised by: `packages/identity/src/service/api_key.ts` - `verify`.
- Guard: `if (row.status === 'revoked') throw new
  ApiKeyError('api_key_revoked', 'this key has been revoked')`, mapped to
  `IDENTITY_ERR.api_key_revoked` in `apps/api/src/middleware/auth.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1041",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1041",
  "message":   "this key has been revoked",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1040`](./ERR-P01-IDT-1040.md) - API-Key invalid.
- [`ERR-P01-IDT-1042`](./ERR-P01-IDT-1042.md) - API-Key expired.
- [`ERR-P01-IDT-1043`](./ERR-P01-IDT-1043.md) - owner human not active.

## Changelog

- 0.1.0 - introduced.
