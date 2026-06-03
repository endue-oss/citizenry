---
code: ERR-P01-IDT-2005
title: Key binding invalid
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2001
  - ERR-P01-IDT-2006
---

# `ERR-P01-IDT-2005` - Key binding invalid

## Summary

The `key_binding_jws` that ties the X25519 encryption key to the Ed25519
signing identity failed verification.

## When this is raised

- On `POST /v1/agent/register` (client-supplied-key path), the binding
  JWS is absent, malformed, or fails any of its checks:
  - not a compact (three-part) JWS, or non-JSON header/payload,
  - `alg` not `EdDSA`, or `purpose` not `"key-binding"`,
  - `sig_jwk.x` / `enc_jwk.x` do not match the supplied public keys,
  - `slug` does not match the request slug,
  - `exp` missing or in the past,
  - the Ed25519 signature does not verify against the sig key.
- The binding is the proof-of-possession that closes the registration
  PoP gap: it shows the holder of the sig private key vouches for the
  enc key.

## What to do

- Sign a binding JWS with the agent's Ed25519 private key over a payload
  containing `purpose: "key-binding"`, the exact `sig_jwk` / `enc_jwk`
  `x` values, the matching `slug`, and a future `exp`. Pass it as
  `key_binding_jws`.
- Or sidestep client key management entirely with
  `generate_keypair: true`, which skips the binding step.

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` -
  `verifyBindingJws` (and the "key_binding_jws is required" guard in
  `register`).
- Guard: each `RegisterError('binding_invalid', …)` site; mapped to
  `IDENTITY_ERR.binding_invalid` (422) in
  `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2005",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2005",
  "message":   "binding signature verification failed",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2001`](./ERR-P01-IDT-2001.md) - signing JWK invalid.
- [`ERR-P01-IDT-2006`](./ERR-P01-IDT-2006.md) - encryption JWK invalid.

## Changelog

- 0.1.0 - introduced.
