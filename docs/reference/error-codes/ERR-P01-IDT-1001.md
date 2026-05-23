---
code: ERR-P01-IDT-1001
title: JWT alg mismatch
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1003
  - ERR-P01-IDT-1004
---

# `ERR-P01-IDT-1001` - JWT alg mismatch

## Summary

The JWS header's `alg` claim is not the EdDSA algorithm required by Citizenry.

## When this is raised

- The client presents an `Authorization: Bearer <JWT>` whose JWS header
  declares `alg` other than the string `"EdDSA"`.
- Includes the absence of `alg` entirely (treated as a mismatch, not as
  unsigned) and any of `RS256`, `HS256`, `ES256`, `none`, etc.
- Raised before the signature is even loaded - no key lookup occurs.

## What to do

- Generate the agent JWT with an Ed25519 (RFC 8037) signing key and set
  `header.alg = "EdDSA"`.
- If you are using a JWT library, ensure it does not silently default to
  `RS256`. Most JOSE libraries require you to pass the algorithm explicitly.
- This is never a server-side bug; the JWT was minted incorrectly by the
  client.

## Server-side cause

- Raised by: `packages/identity/src/auth.ts` - `verifyAgentJwt` step (2).
- Guard: `if (header.alg !== 'EdDSA') throw new AuthError(...)`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1001",
  "title":     "JWT alg mismatch",
  "status":    401,
  "code":      "ERR-P01-IDT-1001",
  "message":   "unexpected alg: RS256",
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1003`](./ERR-P01-IDT-1003.md) - JWT expired (a later step in
  the same verifier).
- `ERR-P01-IDT-1004` - JWT `kid` not present in issuer JWKS.

## Changelog

- 0.1.0 - introduced.
