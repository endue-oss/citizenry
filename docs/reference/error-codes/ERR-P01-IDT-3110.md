---
code: ERR-P01-IDT-3110
title: Slug taken
http_status: 409
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-2002
  - ERR-P01-IDT-3100
---

# `ERR-P01-IDT-3110` - Slug taken

## Summary

The requested agent `slug` is well-formed but already belongs to another
agent.

## When this is raised

- On `POST /v1/agent/register`, the (valid) `slug` collides with an
  existing `agent` row. Slugs are globally unique.
- Distinct from `ERR-P01-IDT-2002` (the slug fails the pattern); here the
  shape is fine but the name is occupied.

## What to do

- Choose a different slug and retry.
- Slugs are never recycled implicitly - if you control the existing
  agent and want the name, revoke or rename it first (admin surface).

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` - `register`
  (slug uniqueness check).
- Guard: `if (existing[0]) throw new RegisterError('slug_taken', 'slug
  already in use', { slug })`; mapped to `IDENTITY_ERR.slug_taken` (409)
  in `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-3110",
  "title":     "Conflict",
  "status":    409,
  "code":      "ERR-P01-IDT-3110",
  "message":   "slug already in use",
  "detail":    { "slug": "atlas" },
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-2002`](./ERR-P01-IDT-2002.md) - slug invalid (bad shape).
- [`ERR-P01-IDT-3100`](./ERR-P01-IDT-3100.md) - email already in use.

## Changelog

- 0.1.0 - introduced.
