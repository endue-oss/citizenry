---
code: ERR-P01-FED-3002
title: Federation peer already exists
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-3001
  - ERR-P01-FED-3003
---

# `ERR-P01-FED-3002` — Federation peer already exists

## Summary

`POST /v1/admin/federation/peers` was called for an `issuer_url` that
already has a non-revoked `federation_peer` row.

## When this is raised

- A peer for the same issuer URL exists in `state ∈ { invited, pending,
  trusted, suspended }`.
- Note that `revoked` rows are kept as historical record; they do **not**
  trigger this code. Re-federating with a previously-revoked peer creates a
  new `fdp_*` row.

## What to do

- If you intend to re-establish a connection, first revoke the existing peer
  via `DELETE /v1/admin/federation/peers/:id`, then POST again.
- If you intended a state change (resume / suspend), use
  `POST /v1/admin/federation/peers/:id/transition` with `target_state`.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/index.ts` — `addPeer`.
- Guard: `repo.findActiveByIssuer(issuer)` returned a non-revoked row.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-3002",
  "title":     "Federation peer already exists",
  "status":    409,
  "code":      "ERR-P01-FED-3002",
  "message":   "peer already in state trusted",
  "detail":    {
    "existing_id": "fdp_01JABCDXYZ012345678901234",
    "state":       "trusted"
  },
  "method":    "POST",
  "instance":  "/v1/admin/federation/peers",
  "request_url": "https://api.citizenry.id/v1/admin/federation/peers",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-3001`](./ERR-P01-FED-3001.md) — peer not found.
- [`ERR-P01-FED-3003`](./ERR-P01-FED-3003.md) — peer state transition not
  allowed.

## Changelog

- 0.1.0 — introduced as part of RFC-0001.
