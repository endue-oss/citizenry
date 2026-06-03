---
code: ERR-P01-VLT-0404
title: Entry Not Found
http_status: 404
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-VLT-0401
---

# `ERR-P01-VLT-0404` - Entry Not Found

## Summary

The requested vault entry does not exist, or is owned by another principal.

## When this is raised

- A `GET /vault/entries/:id` or `DELETE /vault/entries/:id` targets an `id`
  that has no row.
- The row exists but its `owner_id` does not match the caller's agent
  subject. A non-owner read is **deliberately indistinguishable** from a
  missing entry - the vault exposes no existence oracle across owners.
- Both cases collapse to the same 404 with the same message; the response
  carries no detail that would confirm whether the id exists.

## What to do

- Confirm the entry id and that it was created under the same agent
  principal now making the request.
- If you expected to own it, check that you are presenting the correct
  agent JWT - a different `sub` will see the entry as absent.
- Do not retry verbatim; a 404 here is deterministic for a given
  (principal, id) pair.

## Server-side cause

- Raised by: `packages/vault/src/router/index.ts` - the `GET /entries/:id`
  and `DELETE /entries/:id` handlers, translating a thrown `VaultError`
  into `404 / VAULT_ERR.not_found`.
- Guard: `packages/vault/src/service/vault.ts` `get`/`delete` throw
  `new VaultError('not_found', …)` when `!row || row.ownerId !== ownerId`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-VLT-0404",
  "title":     "Entry Not Found",
  "status":    404,
  "code":      "ERR-P01-VLT-0404",
  "message":   "entry not found",
  "method":    "GET",
  "instance":  "/v1/vault/entries/ent_2g8Xq4mZr0",
  "request_url": "https://api.citizenry.id/v1/vault/entries/ent_2g8Xq4mZr0",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-VLT-0401`](./ERR-P01-VLT-0401.md) - no authenticated principal
  at all (vs. an authenticated caller that simply does not own the entry).

## Changelog

- 0.1.0 - introduced.
