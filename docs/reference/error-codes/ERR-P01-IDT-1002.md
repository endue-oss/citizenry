---
code: ERR-P01-IDT-1002
title: JWT aud mismatch
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1001
  - ERR-P01-IDT-1003
---

# `ERR-P01-IDT-1002` - JWT aud mismatch

## Summary

The JWT's `aud` (audience) claim does not include any audience this
deployment accepts.

## When this is raised

- The token's `aud` claim (a string or array) shares no value with the
  Worker's configured `JWT_AUDIENCE` list (e.g. `api.citizenry.id` /
  `citizenry-id`).
- An absent `aud` is treated as an empty set and therefore also fails.
- Checked after `alg`, `kid`, and the self-signed claim sanity, but
  before the expiry and signature checks.

## What to do

- Mint the JWT with an `aud` claim that matches this deployment's
  expected audience. If you are calling the hosted service, set
  `aud = "api.citizenry.id"` (or the value your operator configured).
- A single string or an array containing the expected value both work -
  only one element needs to match.

## Server-side cause

- Raised by: `packages/identity/src/auth.ts` - `verifyAgentJwt` step (5).
- Guard: `const audOk = auds.some((a) => opts.audience.includes(a)); if
  (!audOk) throw new AuthError(IDENTITY_ERR.jwt_aud_mismatch, …)`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1002",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1002",
  "message":   "aud does not match allowed audiences",
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1001`](./ERR-P01-IDT-1001.md) - JWT alg mismatch (an
  earlier step in the same verifier).
- [`ERR-P01-IDT-1003`](./ERR-P01-IDT-1003.md) - JWT expired (a later
  step).

## Changelog

- 0.1.0 - introduced.
