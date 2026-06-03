---
code: ERR-P01-IDT-1040
title: API-Key invalid
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1041
  - ERR-P01-IDT-1042
  - ERR-P01-IDT-1043
---

# `ERR-P01-IDT-1040` - API-Key invalid

## Summary

The human API-Key bearer (`chk_…`) is malformed or matches no stored
key.

## When this is raised

- The bearer does not start with the `chk_` prefix.
- The peppered SHA-256 of the token matches no `human_api_key` row.
- The matched key's owner row is missing (dangling owner reference).
- An endpoint requiring an API-Key actor (e.g. `POST /v1/agent/register`)
  was called with no resolvable key.

## What to do

- Present the exact `chk_…` token issued by `POST /v1/humans/verify`. The
  raw token is surfaced only once at issue and is unrecoverable - if lost,
  rotate via `POST /v1/humans/rotate` + `/verify` to mint a new one.
- A revoked or expired key returns a more specific code
  (`ERR-P01-IDT-1041` / `ERR-P01-IDT-1042`), not this one.

## Server-side cause

- Raised by: `packages/identity/src/service/api_key.ts` - `verify`
  (prefix check, hash-miss, missing owner), surfaced as
  `IDENTITY_ERR.api_key_invalid` in `apps/api/src/middleware/auth.ts`
  (`apiKeyAuth`). Also `packages/identity/src/router/register.ts` emits
  it for the "api-key required" guard.
- Guard: `if (!rawToken.startsWith(API_KEY_PREFIX)) throw new
  ApiKeyError('api_key_invalid', …)` and `if (!row) throw new
  ApiKeyError('api_key_invalid', 'token not recognised')`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1040",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1040",
  "message":   "token not recognised",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1041`](./ERR-P01-IDT-1041.md) - API-Key revoked.
- [`ERR-P01-IDT-1042`](./ERR-P01-IDT-1042.md) - API-Key expired.
- [`ERR-P01-IDT-1043`](./ERR-P01-IDT-1043.md) - owner human not active.

## Changelog

- 0.1.0 - introduced.
