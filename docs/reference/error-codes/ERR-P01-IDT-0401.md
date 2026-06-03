---
code: ERR-P01-IDT-0401
title: Unauthorized
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1001
  - ERR-P01-IDT-1004
  - ERR-P01-IDT-1040
---

# `ERR-P01-IDT-0401` - Unauthorized

## Summary

Authentication failed and no more specific 1xxx code applies - the
catch-all for a missing, malformed, or unverifiable credential.

## When this is raised

- No `Authorization: Bearer` header was sent to a guarded route.
- The bearer is a compact JWS that does not split into three parts, or
  whose header/payload is not valid JSON.
- Self-signed claim checks fail: `iss` does not equal `sub`, or `sub`
  does not match the key's `agent_id`.
- The Ed25519 signature does not verify, or the owning agent is not in
  `active` status.
- The `X-Service-Key` presented to `/_admin/*` is missing or does not
  match (constant-time compare).

## What to do

- Attach a valid `Authorization: Bearer <JWT>` (or `X-Service-Key` for
  admin routes) and retry.
- If the message points at a self-signed claim, ensure `iss == sub ==
  agent_id` and that you are signing with the agent's own key.
- If the signature fails, confirm you are signing the exact
  `header.payload` bytes with the Ed25519 private key whose public half
  is registered under the `kid`.

## Server-side cause

- Raised by: `packages/identity/src/auth.ts` - `verifyAgentJwt` (parse,
  self-signed sanity, signature, and agent-active guards) and the noop
  verifier; also `apps/api/src/middleware/auth.ts` (`serviceKeyAuth` and
  the missing-bearer guard) and `apps/mail/src/middleware/auth.ts`.
- Guard: every `new AuthError(IDENTITY_ERR.unauthorized, …)` site.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0401",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-0401",
  "message":   "Authorization Bearer missing",
  "method":    "GET",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1001`](./ERR-P01-IDT-1001.md) - JWT alg mismatch (a
  specific verifier failure).
- [`ERR-P01-IDT-1004`](./ERR-P01-IDT-1004.md) - JWT kid unknown.
- [`ERR-P01-IDT-1040`](./ERR-P01-IDT-1040.md) - API-Key invalid.

## Changelog

- 0.1.0 - introduced.
