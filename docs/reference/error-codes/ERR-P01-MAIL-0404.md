---
code: ERR-P01-MAIL-0404
title: Not Found
http_status: 404
category: business
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-0401
---

# `ERR-P01-MAIL-0404` - Not Found

## Summary

The requested mail does not exist, or is owned by another account.

## When this is raised

- A `GET /mails/:id` targets an `id` that resolves to no row for the
  authenticated account.
- The row may exist under a different `accountId`; a non-owner read is
  **indistinguishable** from a missing mail - the lookup is scoped by the
  caller's account, so cross-account messages collapse to the same `404`.
- The response carries no detail that would confirm whether the id exists
  for some other principal.

## What to do

- Confirm the mail id and that it belongs to the same agent principal whose
  bearer JWT is presented on the request.
- If you expected to own it, check you are sending the correct agent token -
  a different `sub` will see the message as absent.
- The result is deterministic for a given (account, id) pair; do not retry
  verbatim.

## Server-side cause

- Raised by: `packages/mail/src/router/index.ts` - the `GET /mails/:id`
  handler: `if (!row) throw MAIL.notFound('mail not found')`.
- Guard: `getMail(db, { accountId, mailId })` returns no row for the
  authenticated `accountId`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0404",
  "title":     "Not Found",
  "status":    404,
  "code":      "ERR-P01-MAIL-0404",
  "message":   "mail not found",
  "method":    "GET",
  "instance":  "/mails/mail_2g8Xq4mZr0",
  "request_url": "https://mail.citizenry.id/mails/mail_2g8Xq4mZr0",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-0401`](./ERR-P01-MAIL-0401.md) - the internal-surface
  service-key gate (vs. an authenticated agent that simply does not own the
  mail).

## Changelog

- 0.1.0 - introduced.
