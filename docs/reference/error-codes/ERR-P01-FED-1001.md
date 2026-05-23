---
code: ERR-P01-FED-1001
title: Federation JWS verify failed
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-1002
  - ERR-P01-FED-1003
---

# `ERR-P01-FED-1001` - Federation JWS verify failed

## Summary

A federation handshake body did not produce a verifiable Ed25519 signature
against the peer's JWKS, or one of the structural payload claims (`alg`,
`kid`, `iat`, `exp`, `nonce`, `purpose`) is missing or malformed.

## When this is raised

- The compact JWS submitted to `POST /federation/handshake` cannot be split
  into three base64url segments.
- The verifier reports an algorithm other than `EdDSA`, or a `kid` not found
  in the peer's cached JWKS.
- The signature does not validate against any public key.
- The decoded payload is missing one of the required fields
  (`from_issuer`, `from_instance_id`, `to_issuer`, `purpose`, `iat`, `exp`,
  `nonce`), or those fields fail their format checks (e.g., `nonce` not
  base64url ≥ 16 chars, `exp - iat > 600`, `purpose` not a known enum value).

## What to do

- Sign with an Ed25519 key listed in your instance's
  `/.well-known/jwks.json`. Most JOSE libraries require you to pass the
  algorithm explicitly - make sure it is `"EdDSA"`.
- Re-issue the handshake with `iat = now`, `exp ≤ now + 600`, fresh 32-byte
  base64url `nonce`, and a `purpose` from `FederationPurpose`.
- If the receiver cannot fetch your JWKS, also confirm that
  `https://<your-issuer>/.well-known/jwks.json` is publicly reachable.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/jws.ts` -
  `verifyHandshakeJws`.
- Guard: every step from `verifier()` call to nonce shape check throws
  `FED.jwsVerifyFailed(...)` with a precise reason in `detail.kind`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-1001",
  "title":     "Federation JWS verify failed",
  "status":    401,
  "code":      "ERR-P01-FED-1001",
  "message":   "iat..exp window > 600s",
  "detail":    { "iat": 1715923200, "exp": 1715924100 },
  "method":    "POST",
  "instance":  "/federation/handshake",
  "request_url": "https://citizenry.id/federation/handshake",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-1002`](./ERR-P01-FED-1002.md) - `from_issuer` does not match
  the presenting peer.
- [`ERR-P01-FED-1003`](./ERR-P01-FED-1003.md) - nonce replay.

## Changelog

- 0.1.0 - introduced as part of RFC-0001.
