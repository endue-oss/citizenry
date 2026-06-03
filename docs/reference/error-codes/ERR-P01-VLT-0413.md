---
code: ERR-P01-VLT-0413
title: Payload Too Large
http_status: 413
category: transport
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-2001
  - ERR-P01-VLT-0400
---

# `ERR-P01-VLT-0413` - Payload Too Large

## Summary

The entry `data` blob exceeds the vault's maximum byte size.

## When this is raised

- A `POST /vault/entries` body has a `data` string whose UTF-8 byte length
  is greater than `VAULT_DATA_MAX_BYTES` (currently `65536` bytes).
- Measured as encoded bytes, not character count - multi-byte characters
  count for more than one byte against the cap.
- The body parsed cleanly and `data` is a non-empty string; only the size
  limit was breached.

> Category note: `413` is not in the transport row of the guideline's §4
> table (`400`, `415`, `503`), but it is a transport-level size constraint -
> the vault never inspects the opaque JWE payload, so an oversized blob is a
> transport concern, not a schema one. This page extends the transport
> class to cover `413`.

## What to do

- Reduce the size of the encrypted `data` blob below the 65 536-byte cap,
  or split the secret across multiple entries.
- Compress the plaintext before encryption if appropriate; the cap is on
  the stored JWE string, not the decrypted payload.
- This is a hard limit - retrying the same body will fail identically.

## Server-side cause

- Raised by: `packages/vault/src/router/index.ts` - `POST /entries`
  handler.
- Guard: `if (byteLength(body.data) > VAULT_DATA_MAX_BYTES) { … }`, where
  `byteLength` is `new TextEncoder().encode(s).byteLength` and the cap is
  defined in `packages/vault/src/service/vault.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0413",
  "title":     "Payload Too Large",
  "status":    413,
  "code":      "ERR-P01-VLT-0413",
  "message":   "data exceeds 65536 bytes",
  "method":    "POST",
  "instance":  "/v1/vault/entries",
  "request_url": "https://api.citizenry.id/v1/vault/entries",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-2001`](./ERR-P01-VLT-2001.md) - `data` missing or empty
  (vs. present but oversized).
- [`ERR-P01-VLT-0400`](./ERR-P01-VLT-0400.md) - body was not valid JSON at
  all.

## Changelog

- 0.1.0 - introduced.
