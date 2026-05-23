---
code: ERR-P01-FED-3001
title: Federation peer not found
http_status: 404
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-3002
---

# `ERR-P01-FED-3001` - Federation peer not found

## Summary

The federation peer id referenced by an admin operation does not exist.

## When this is raised

- `GET /v1/admin/federation/peers/:id` - no `federation_peer` row with the
  given `fdp_*` id.
- `POST /v1/admin/federation/peers/:id/transition` or `/jwks-refresh` for
  an unknown id.
- `DELETE /v1/admin/federation/peers/:id` for an unknown id (note: revoke
  of an already-revoked peer is **idempotent**, returns 204, not 404).
- Inbound `federation.confirm`, `federation.revoke`, or `federation.suspend`
  references an issuer that has no corresponding local row.

## What to do

- Verify the `fdp_*` id with `GET /v1/admin/federation/peers`.
- If you expected the peer to exist, check whether it was revoked - revoked
  rows still respond to read operations until pruning.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/index.ts` -
  `getPeer`, `transitionPeer`, `revokePeer`, `refreshJwks`, `handleInbound`.
- Guard: `repo.findById(id)` returned `undefined`, or
  `repo.findActiveByIssuer(from_issuer)` did during an inbound non-invite
  purpose.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-3001",
  "title":     "Federation peer not found",
  "status":    404,
  "code":      "ERR-P01-FED-3001",
  "message":   "fdp fdp_01JABCDXYZ012345678901234",
  "method":    "GET",
  "instance":  "/v1/admin/federation/peers/fdp_01JABCDXYZ012345678901234",
  "request_url": "https://api.citizenry.id/v1/admin/federation/peers/fdp_01JABCDXYZ012345678901234",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-3002`](./ERR-P01-FED-3002.md) - peer already exists.

## Changelog

- 0.1.0 - introduced as part of RFC-0001.
