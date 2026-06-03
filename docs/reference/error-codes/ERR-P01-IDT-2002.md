---
code: ERR-P01-IDT-2002
title: Slug invalid
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-3110
  - ERR-P01-IDT-2003
---

# `ERR-P01-IDT-2002` - Slug invalid

## Summary

The agent `slug` does not match the required pattern.

## When this is raised

- On `POST /v1/agent/register`, `slug` fails the pattern
  `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`: it must be lowercase
  alphanumeric with internal hyphens, 1-63 characters, and may not start
  or end with a hyphen.
- This is a shape check, distinct from `ERR-P01-IDT-3110` (the slug is
  well-formed but already taken).

## What to do

- Normalise the slug to lowercase `[a-z0-9-]`, 1-63 chars, no
  leading/trailing hyphen, then retry.
- If the slug is valid but you got a conflict instead, see
  `ERR-P01-IDT-3110`.

## Server-side cause

- Raised by: `packages/identity/src/service/register.ts` - `register`
  (first guard).
- Guard: `if (!SLUG_RE.test(input.slug)) throw new
  RegisterError('slug_invalid', …)`; mapped to `IDENTITY_ERR.slug_invalid`
  (422) in `packages/identity/src/router/register.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2002",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2002",
  "message":   "slug must match [a-z0-9-] up to 63 chars",
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-3110`](./ERR-P01-IDT-3110.md) - slug taken (valid shape,
  already in use).
- [`ERR-P01-IDT-2003`](./ERR-P01-IDT-2003.md) - tenant invalid.

## Changelog

- 0.1.0 - introduced.
