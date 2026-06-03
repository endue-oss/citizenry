---
code: ERR-P01-IDT-3002
title: Agent revoked
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-3001
  - ERR-P01-IDT-0401
---

# `ERR-P01-IDT-3002` - Agent revoked

## Summary

A revoked agent attempted a self-service operation.

## When this is raised

- A revoked agent calls a `/v1/agent/me` self-service route (rotate-key
  or self-revoke). A revoked agent has no remaining self-service surface
  - the only forward path is re-registration.
- Distinct from the JWT-time `unauthorized` (`ERR-P01-IDT-0401`)
  agent-not-active check: this is the business-rule rejection on the
  self-service flow specifically.

## What to do

- A revoked agent cannot be reactivated via self-service. Register a new
  agent under the owning human's API-Key.
- If the revocation was unexpected, an operator must investigate.

## Server-side cause

- Reserved - will be raised by the `/v1/agent/me` self-service flow; not
  yet wired (`packages/identity/src/service/me.ts`, where `rotateKey` /
  `selfRevoke` currently throw `not implemented`).

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-3002",
  "title":     "Conflict",
  "status":    409,
  "code":      "ERR-P01-IDT-3002",
  "message":   "agent is revoked and has no self-service surface",
  "method":    "DELETE",
  "instance":  "/v1/agent/me",
  "request_url": "https://api.citizenry.id/v1/agent/me",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-3001`](./ERR-P01-IDT-3001.md) - key not active.
- [`ERR-P01-IDT-0401`](./ERR-P01-IDT-0401.md) - unauthorized (the
  JWT-time agent-not-active check).

## Changelog

- 0.1.0 - introduced.
