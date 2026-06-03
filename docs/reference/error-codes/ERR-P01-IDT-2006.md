---
code: ERR-P01-IDT-2006
title: Encryption JWK invalid
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2001
  - ERR-P01-IDT-2005
---

# `ERR-P01-IDT-2006` - Encryption JWK invalid

## Summary

The supplied X25519 encryption public key (`encryption_key_jwk`) is
malformed or missing.

## When this is raised

- On `POST /v1/agent/register` (client-supplied-key path), the
  `encryption_key_jwk` fails X25519 JWK validation:
  - not an object,
  - `kty` not `"OKP"`,
  - `crv` not `"X25519"`,
  - `x` missing / not a base64url string,
  - `x` does not decode to exactly 32 bytes.
- Also raised when `public_key_jwk` is supplied without a paired
  `encryption_key_jwk` - the enc key is required alongside the sig key.

## What to do

- Send a well-formed X25519 public JWK: `{ "kty": "OKP", "crv":
  "X25519", "x": "<32-byte base64url>" }`, alongside the signing JWK and
  the binding JWS.
- Or pass `generate_keypair: true` to have the server mint both keypairs
  and surface the private JWKs once.

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` -
  `validateX25519Jwk` (and the "encryption_key_jwk is required" guard in
  `register`).
- Guard: the `kty`/`crv`/`x`/length assertions, each throwing
  `RegisterError('enc_jwk_invalid', …)`; mapped to
  `IDENTITY_ERR.enc_jwk_invalid` (422) in
  `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2006",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2006",
  "message":   "crv must be \"X25519\"",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2001`](./ERR-P01-IDT-2001.md) - signing JWK invalid.
- [`ERR-P01-IDT-2005`](./ERR-P01-IDT-2005.md) - key binding invalid.

## Changelog

- 0.1.0 - introduced.
