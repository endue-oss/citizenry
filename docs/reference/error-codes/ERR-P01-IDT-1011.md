---
code: ERR-P01-IDT-1011
title: JWS action mismatch
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1010
  - ERR-P01-IDT-1012
---

# `ERR-P01-IDT-1011` - JWS action mismatch

## Summary

A body-signed request's payload declares an action that does not match
the endpoint it was sent to.

## When this is raised

- The JWS payload's action/purpose claim (e.g. `rotate-key`) does not
  match the route being called (`DELETE /v1/agent/me` vs.
  `POST /v1/agent/me/rotate-key`).
- This binds each signed request to a single intended operation so a JWS
  minted for one action cannot be redirected to another.

## What to do

- Mint the JWS with the action claim that matches the endpoint you are
  calling.
- Do not reuse a JWS across the rotate-key and self-revoke endpoints -
  sign a fresh payload per action.

## Server-side cause

- Reserved - will be raised by the `/v1/agent/me` rotate-key /
  self-revoke flow; not yet wired
  (`packages/identity/src/service/me.ts`, where `rotateKey` and
  `selfRevoke` currently throw `not implemented`).

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1011",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1011",
  "message":   "payload action does not match this endpoint",
  "method":    "DELETE",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1010`](./ERR-P01-IDT-1010.md) - JWS replay.
- [`ERR-P01-IDT-1012`](./ERR-P01-IDT-1012.md) - JWS lifetime exceeded.

## Changelog

- 0.1.0 - introduced.
