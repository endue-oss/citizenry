---
code: ERR-P01-FED-4001
title: Peer discovery failed
http_status: 502
category: external
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-4002
  - ERR-P01-FED-4003
---

# `ERR-P01-FED-4001` - Peer discovery failed

## Summary

A peer's `/.well-known/citizenry-peer` document could not be fetched or did
not pass the structural checks (`protocol_version`, `issuer`,
`instance_id`).

## When this is raised

- The HTTP request to `https://<peer>/.well-known/citizenry-peer` returned a
  non-2xx status, timed out, or yielded a body that was not valid JSON.
- The response is JSON but missing one of: `protocol_version` (number),
  `issuer` (string, must match the requested host), `instance_id`
  (`^ci_[0-9A-HJKMNP-TV-Z]{26}$`).
- The peer's reported `issuer` field disagrees with the URL that served the
  document.

## What to do

- Verify the peer is online and exposes
  `https://<peer>/.well-known/citizenry-peer` with the expected schema (see
  RFC-0001 §"Peer discovery").
- Confirm the peer's TLS certificate and that no upstream proxy is
  intercepting the well-known path.
- Retry after the peer has redeployed; the local row stays in `invited`
  state and the operation can be re-issued.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/discovery.ts` -
  `fetchPeerDiscovery`.
- Guard: `fetch` non-OK, non-JSON body, or missing/invalid fields.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-4001",
  "title":     "Peer discovery failed",
  "status":    502,
  "code":      "ERR-P01-FED-4001",
  "message":   "HTTP 503 from https://bob.example/.well-known/citizenry-peer",
  "detail":    { "status": 503 },
  "method":    "POST",
  "instance":  "/v1/admin/federation/peers",
  "request_url": "https://api.citizenry.id/v1/admin/federation/peers",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-4002`](./ERR-P01-FED-4002.md) - peer JWKS fetch failed.
- [`ERR-P01-FED-4003`](./ERR-P01-FED-4003.md) - peer handshake remote error.

## Changelog

- 0.1.0 - introduced as part of RFC-0001.
