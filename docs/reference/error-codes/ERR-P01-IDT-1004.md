---
code: ERR-P01-IDT-1004
title: JWT kid unknown
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1001
  - ERR-P01-IDT-1002
---

# `ERR-P01-IDT-1004` - JWT kid unknown

## Summary

The JWS header's `kid` is missing, or resolves to no usable signing key.

## When this is raised

- The JWS header has no `kid` at all.
- The `kid` does not match any `agent_key` row scoped to `use = 'sig'`
  and `status ∈ {active, rotated}` - i.e. the key is unknown, revoked,
  or is an encryption (`use = 'enc'`) key that may never verify a JWT.
- Raised before signature verification - no public key is loaded for an
  unresolved `kid`.

## What to do

- Set `header.kid` to the `kid` returned at agent registration for the
  signing key.
- If the key was rotated, sign with the current active key's `kid`
  (rotated keys still verify during their grace window; revoked keys do
  not).
- Confirm you are presenting a *signing* key id, not the agent's
  X25519 encryption `kid`.

## Server-side cause

- Raised by: `packages/identity/src/auth.ts` - `verifyAgentJwt` steps
  (2)/(3).
- Guard: `if (!header.kid) throw new AuthError(IDENTITY_ERR.jwt_kid_unknown,
  'header.kid missing')` and, after the `agent_key` lookup, `if (!key)
  throw new AuthError(IDENTITY_ERR.jwt_kid_unknown, 'kid unknown or
  revoked')`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1004",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1004",
  "message":   "kid unknown or revoked",
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1001`](./ERR-P01-IDT-1001.md) - JWT alg mismatch (the
  preceding verifier step).
- [`ERR-P01-IDT-1002`](./ERR-P01-IDT-1002.md) - JWT aud mismatch.

## Changelog

- 0.1.0 - introduced.
