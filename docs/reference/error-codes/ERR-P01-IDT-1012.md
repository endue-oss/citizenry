---
code: ERR-P01-IDT-1012
title: JWS lifetime exceeded
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1010
  - ERR-P01-IDT-1011
---

# `ERR-P01-IDT-1012` - JWS lifetime exceeded

## Summary

A body-signed request declares a validity window wider than the server's
recommended maximum (`exp - iat` too large).

## When this is raised

- The JWS payload's `exp - iat` span exceeds the recommended maximum
  lifetime for a self-service body JWS.
- Unlike `ERR-P01-IDT-1003` (the token is simply past `exp`), this
  rejects a token whose *requested lifetime* is too long to be accepted
  at all, limiting the blast radius of a leaked single-use JWS.

## What to do

- Mint the JWS with a short, bounded lifetime - set `exp` close to `iat`
  (a small number of minutes is ample for a single self-service call).
- Do not pre-mint long-lived signed requests; sign just before sending.

## Server-side cause

- Reserved - will be raised by the `/v1/agent/me` rotate-key /
  self-revoke flow; not yet wired
  (`packages/identity/src/service/me.ts`, where `rotateKey` and
  `selfRevoke` currently throw `not implemented`).

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1012",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1012",
  "message":   "JWS lifetime exceeds the allowed maximum",
  "method":    "POST",
  "instance":  "/v1/agent/me/rotate-key",
  "request_url": "https://api.citizenry.id/v1/agent/me/rotate-key",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1010`](./ERR-P01-IDT-1010.md) - JWS replay.
- [`ERR-P01-IDT-1011`](./ERR-P01-IDT-1011.md) - JWS action mismatch.

## Changelog

- 0.1.0 - introduced.
