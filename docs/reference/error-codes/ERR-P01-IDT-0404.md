---
code: ERR-P01-IDT-0404
title: Resource not found
http_status: 404
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-3100
  - ERR-P01-IDT-3110
---

# `ERR-P01-IDT-0404` - Resource not found

## Summary

The addressed identity resource (human, agent, or key) does not exist.

## When this is raised

- `GET /v1/admin/humans/:id` is called with an `id` that has no `human`
  row.
- `GET /v1/admin/agents/:id` is called with an `id` that has no `agent`
  row.
- The generic lookup-miss code for the identity service; it is never
  used to mask an authorization failure (those are 401/403).

## What to do

- Verify the resource id. For admin reads, list the collection first
  (`GET /v1/admin/agents`) and use an id from the response.
- A 404 here is terminal for the given id - do not retry without
  changing it.

## Server-side cause

- Raised by: `packages/identity/src/router/admin.ts` - the
  `GET /v1/admin/humans/:id` and `GET /v1/admin/agents/:id` handlers.
- Guard: `const row = rows[0]; if (!row) return c.json({ code:
  IDENTITY_ERR.not_found, … }, 404)`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-0404",
  "title":     "Not Found",
  "status":    404,
  "code":      "ERR-P01-IDT-0404",
  "message":   "no agent with this id",
  "method":    "GET",
  "instance":  "/v1/admin/agents/ag_01J0AGENT",
  "request_url": "https://api.citizenry.id/v1/admin/agents/ag_01J0AGENT",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-3100`](./ERR-P01-IDT-3100.md) - human email already in
  use (a conflict, not a miss).
- [`ERR-P01-IDT-3110`](./ERR-P01-IDT-3110.md) - slug taken.

## Changelog

- 0.1.0 - introduced.
