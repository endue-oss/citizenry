---
code: ERR-P01-IDT-0409
title: Conflict
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-3100
  - ERR-P01-IDT-3110
---

# `ERR-P01-IDT-0409` - Conflict

## Summary

A generic write conflict - the request would violate a uniqueness or
state constraint that has no more specific 3xxx code.

## When this is raised

- Reserved as the transport-level fallback for conflicting writes. The
  concrete conflicts that the identity service can produce today carry
  their own dedicated codes instead: duplicate email
  (`ERR-P01-IDT-3100`) and duplicate slug (`ERR-P01-IDT-3110`).
- A future write surface that hits a unique constraint without a
  dedicated business code would surface this generic 409.

## What to do

- Re-read the current state of the resource and reconcile before
  retrying. Do not blindly retry - the conflict will recur until the
  colliding state changes.
- If you expected a dedicated code (3100 / 3110) and got this generic
  one, report it - the raise site likely needs a more specific code.

## Server-side cause

- Reserved - not currently emitted by any identity raise site. Concrete
  conflicts route through `ERR-P01-IDT-3100` / `ERR-P01-IDT-3110` in
  `packages/identity/src/router/register.ts` and
  `packages/identity/src/router/humans.ts`. Declared in
  `packages/spec/identity/errors.tsp` as the generic 409 fallback.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0409",
  "title":     "Conflict",
  "status":    409,
  "code":      "ERR-P01-IDT-0409",
  "message":   "the request conflicts with the current resource state",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-3100`](./ERR-P01-IDT-3100.md) - human email already in
  use (the concrete 409 for `POST /v1/humans`).
- [`ERR-P01-IDT-3110`](./ERR-P01-IDT-3110.md) - slug taken (the concrete
  409 for register).

## Changelog

- 0.1.0 - introduced.
