---
code: ERR-P01-IDT-1003
title: JWT expired
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1001
---

# `ERR-P01-IDT-1003` — JWT expired

## Summary

The JWT's `exp` (expiration) claim is in the past, or the claim is missing.

## When this is raised

- The token's `payload.exp` (epoch seconds) is less than or equal to the
  server's current wall-clock time.
- The token has no `exp` claim at all — Citizenry refuses to verify tokens
  that do not bind themselves to a lifetime.
- Clock skew is **not** absorbed by Citizenry; clients should mint tokens
  with a comfortable margin (recommended: `exp = now + 600`).

## What to do

- Mint a fresh JWT and retry. The minting key remains valid; only the token
  has aged out.
- If you are caching JWTs client-side, drop the entry and re-sign.
- If clock skew is suspected, ensure your client's wall clock is synced
  (NTP or equivalent).

## Server-side cause

- Raised by: `packages/identity/src/auth.ts` — `verifyAgentJwt` step (6).
- Guard: `if (!payload.exp || payload.exp <= now) throw new AuthError(...)`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1003",
  "title":     "JWT expired",
  "status":    401,
  "code":      "ERR-P01-IDT-1003",
  "message":   "JWT expired",
  "detail":    { "exp": 1715923200, "now": 1715926800 },
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1001`](./ERR-P01-IDT-1001.md) — JWT alg mismatch (earlier
  step in the same verifier).

## Changelog

- 0.1.0 — introduced.
