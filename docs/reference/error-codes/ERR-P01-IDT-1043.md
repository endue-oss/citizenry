---
code: ERR-P01-IDT-1043
title: Owner human not active
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-1040
  - ERR-P01-IDT-1100
---

# `ERR-P01-IDT-1043` - Owner human not active

## Summary

The API-Key is valid, but the human who owns it is not in `active`
status.

## When this is raised

- A `chk_…` token resolves to a live key whose owner `human` row has a
  status other than `active` (e.g. still `pending_verification`).
- Also raised when minting a key for a human that is not yet verified -
  the issue path refuses to bind a credential to a non-active owner.

## What to do

- Complete email verification for the owning human via
  `POST /v1/humans/verify`. Once the human flips to `active`, the key
  works.
- If the human was suspended, this is terminal until an operator
  restores the account.

## Server-side cause

- Raised by: `packages/identity/src/service/api_key.ts` - `verify` (owner
  status check) and `doIssue` (issue-time check).
- Guard: `if (owner.status !== 'active') throw new
  ApiKeyError('human_not_active', …)`, mapped to
  `IDENTITY_ERR.human_not_active` in `apps/api/src/middleware/auth.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-1043",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-IDT-1043",
  "message":   "owner is not verified",
  "detail":    { "status": "pending_verification" },
  "method":    "POST",
  "instance":  "/v1/agent/register",
  "request_url": "https://api.citizenry.id/v1/agent/register",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-1040`](./ERR-P01-IDT-1040.md) - API-Key invalid.
- [`ERR-P01-IDT-1100`](./ERR-P01-IDT-1100.md) - verification code invalid
  (the step that activates the owner).

## Changelog

- 0.1.0 - introduced.
