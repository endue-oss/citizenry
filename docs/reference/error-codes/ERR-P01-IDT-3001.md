---
code: ERR-P01-IDT-3001
title: Key not active
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-3002
  - ERR-P01-IDT-1004
---

# `ERR-P01-IDT-3001` - Key not active

## Summary

A rotate-key request was signed by a key that is not in `active` status.

## When this is raised

- `POST /v1/agent/me/rotate-key` is authenticated by a body JWS signed
  with a key whose `agent_key.status` is not `active` (e.g. already
  `rotated` or `revoked`).
- Rotation must be authorised by the current live signing key; a stale
  key cannot rotate itself forward.

## What to do

- Sign the rotate-key JWS with your current active signing key.
- If your only key is already rotated or revoked, you cannot self-rotate
  - re-register the agent or contact an operator.

## Server-side cause

- Reserved - will be raised by the `/v1/agent/me` rotate-key flow; not
  yet wired (`packages/identity/src/service/me.ts`, where `rotateKey`
  currently throws `not implemented`).

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-3001",
  "title":     "Conflict",
  "status":    409,
  "code":      "ERR-P01-IDT-3001",
  "message":   "rotate-key must be signed by an active key",
  "method":    "POST",
  "instance":  "/v1/agent/me/rotate-key",
  "request_url": "https://api.citizenry.id/v1/agent/me/rotate-key",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-3002`](./ERR-P01-IDT-3002.md) - agent revoked.
- [`ERR-P01-IDT-1004`](./ERR-P01-IDT-1004.md) - JWT kid unknown/revoked.

## Changelog

- 0.1.0 - introduced.
