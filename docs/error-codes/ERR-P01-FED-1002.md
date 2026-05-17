---
code: ERR-P01-FED-1002
title: Federation issuer mismatch
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-1001
---

# `ERR-P01-FED-1002` — Federation issuer mismatch

## Summary

The `from_issuer` (or `to_issuer`) claim in a verified handshake JWS does
not match the identity Citizenry expected for that request.

## When this is raised

- A handshake is received whose `to_issuer` is not this Citizenry instance's
  configured issuer URL — the JWS was minted for someone else.
- A response/ack JWS arrives during outbound handshake whose `from_issuer`
  is not the peer this instance is talking to (e.g., an attacker reflecting
  another peer's reply).
- The DID resolution for `from_issuer` produces a JWKS that does not contain
  the JWS's `kid`.

## What to do

- Verify your client is targeting the correct peer's
  `federation_handshake_url` (`POST /federation/handshake`).
- Use your own instance's `issuer` value for both signing and the `from_*`
  fields. The `to_issuer` MUST equal the peer's well-known `issuer`.
- If the message is a confirm/ack, ensure you are echoing the same
  `from_issuer ↔ to_issuer` pair as the original invite, just swapped.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/jws.ts` —
  `verifyHandshakeJws`.
- Guard: `to_issuer !== selfIssuer` or
  `expectedFromIssuer && from_issuer !== expectedFromIssuer`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-1002",
  "title":     "Federation issuer mismatch",
  "status":    401,
  "code":      "ERR-P01-FED-1002",
  "message":   "to_issuer https://bob.example does not match self https://citizenry.id",
  "detail":    { "to_issuer": "https://bob.example", "self": "https://citizenry.id" },
  "method":    "POST",
  "instance":  "/federation/handshake",
  "request_url": "https://citizenry.id/federation/handshake",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-1001`](./ERR-P01-FED-1001.md) — generic JWS verify failure.

## Changelog

- 0.1.0 — introduced as part of RFC-0001.
