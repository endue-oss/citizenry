---
code: ERR-P01-FED-3003
title: Federation peer state transition not allowed
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-FED-3001
  - ERR-P01-FED-3002
---

# `ERR-P01-FED-3003` — Federation peer state transition not allowed

## Summary

A request asked the federation peer to move to a state that is not reachable
from its current state under the RFC-0001 state machine.

## When this is raised

- `POST /v1/admin/federation/peers/:id/transition` with `target_state`
  that is neither `trusted` nor `suspended`, or where the current state does
  not allow that transition.
- An inbound `federation.invite` arrives for a peer that is already
  `trusted` or `suspended` (re-federation must be DELETE-then-POST).
- An inbound `federation.suspend` or `federation.resume` does not match the
  allowed table.

## What to do

- Inspect the current state via
  `GET /v1/admin/federation/peers/:id` and consult the
  RFC-0001 state machine:

  ```
  invited   → pending | revoked
  pending   → trusted | revoked
  trusted   → suspended | revoked
  suspended → trusted | revoked
  revoked   → (terminal)
  ```

- For a fresh handshake against an already-trusted peer, first revoke
  (`DELETE`) then `POST`.

## Server-side cause

- Raised by: `packages/identity/src/service/federation/index.ts` —
  `transitionPeer`, `handleInbound` (`invite`, `suspend`, `resume` paths).
- Guard: `isTransitionAllowed(currentState, targetState) === false`, or the
  admin transition target is outside `{trusted, suspended}`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-FED-3003",
  "title":     "Federation peer state transition not allowed",
  "status":    409,
  "code":      "ERR-P01-FED-3003",
  "message":   "trusted → invited not allowed",
  "detail":    { "from": "trusted", "to": "invited" },
  "method":    "POST",
  "instance":  "/v1/admin/federation/peers/fdp_01J…/transition",
  "request_url": "https://api.citizenry.id/v1/admin/federation/peers/fdp_01J…/transition",
  "timestamp": "2026-05-17T09:30:00.000Z"
}
```

## Related codes

- [`ERR-P01-FED-3001`](./ERR-P01-FED-3001.md) — peer not found.
- [`ERR-P01-FED-3002`](./ERR-P01-FED-3002.md) — peer already exists.

## Changelog

- 0.1.0 — introduced as part of RFC-0001.
