---
code: ERR-P01-IDT-2001
title: JWK invalid
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2006
  - ERR-P01-IDT-2005
---

# `ERR-P01-IDT-2001` - JWK invalid

## Summary

The supplied Ed25519 signing public key (`public_key_jwk`) is malformed.

## When this is raised

- On `POST /v1/agent/register` (client-supplied-key path), the
  `public_key_jwk` fails Ed25519 JWK validation:
  - not an object,
  - `kty` not `"OKP"`,
  - `crv` not `"Ed25519"`,
  - `x` missing / not a base64url string,
  - `x` does not decode to exactly 32 bytes.

## What to do

- Send a well-formed RFC 8037 Ed25519 public JWK: `{ "kty": "OKP",
  "crv": "Ed25519", "x": "<32-byte base64url>" }`.
- Verify the `x` value decodes to 32 raw bytes (an Ed25519 public key).
- If you would rather not manage keys, omit the JWKs and pass
  `generate_keypair: true`.

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` - `validateJwk`.
- Guard: the `kty`/`crv`/`x`/length assertions, each throwing
  `RegisterError('jwk_invalid', …)`; mapped to `IDENTITY_ERR.jwk_invalid`
  (422) in `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2001",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2001",
  "message":   "x must decode to 32 bytes",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2006`](./ERR-P01-IDT-2006.md) - encryption JWK invalid
  (the X25519 sibling).
- [`ERR-P01-IDT-2005`](./ERR-P01-IDT-2005.md) - key binding invalid.

## Changelog

- 0.1.0 - introduced.
