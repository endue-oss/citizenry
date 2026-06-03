---
code: ERR-P01-IDT-1010
title: JWS replay
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1011
  - ERR-P01-IDT-1012
---

# `ERR-P01-IDT-1010` - JWS replay

## Summary

A body-signed request was rejected because its `jti` has already been
seen - a replay of a previously consumed JWS.

## When this is raised

- A self-service request (`POST /v1/agent/me/rotate-key` or
  `DELETE /v1/agent/me`) carries a body JWS whose `jti` matches one the
  server already processed.
- These body-JWS endpoints authenticate via the signed payload rather
  than the `Authorization` header, so each JWS must be single-use to
  prevent replay.

## What to do

- Mint a fresh JWS with a new, unique `jti` for every self-service call;
  never resend a JWS that was already submitted.
- Treat a 401 with this code as terminal for that JWS - re-sign and
  retry with a new one.

## Server-side cause

- Reserved - will be raised by the `/v1/agent/me` rotate-key /
  self-revoke flow; not yet wired
  (`packages/identity/src/service/me.ts`, where `rotateKey` and
  `selfRevoke` currently throw `not implemented`). The middleware in
  `apps/api/src/middleware/auth.ts` already routes these body-JWS paths
  past the header JWT check in anticipation.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1010",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1010",
  "message":   "jti has already been used",
  "method":    "POST",
  "instance":  "/v1/agent/me/rotate-key",
  "request_url": "https://api.citizenry.id/v1/agent/me/rotate-key",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1011`](./ERR-P01-IDT-1011.md) - JWS action mismatch.
- [`ERR-P01-IDT-1012`](./ERR-P01-IDT-1012.md) - JWS lifetime exceeded.

## Changelog

- 0.1.0 - introduced.
