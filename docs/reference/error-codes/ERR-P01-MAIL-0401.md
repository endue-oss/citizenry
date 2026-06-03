---
code: ERR-P01-MAIL-0401
title: Unauthorized
http_status: 401
category: auth
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-0400
---

# `ERR-P01-MAIL-0401` - Unauthorized

## Summary

The `X-Service-Key` presented on an `/_internal/*` route is missing or wrong.

## When this is raised

- A request hits `/_internal/notify` without an `X-Service-Key` header, or
  with a value that does not match the mail Worker's `SERVICE_KEY` secret.
  The comparison is constant-time.
- Also raised when the mail Worker has no `SERVICE_KEY` configured at all -
  the route fails closed rather than admitting unauthenticated callers.
- Note: bearer-authenticated `POST /mails` / `GET /mails` failures emit
  **identity** codes (`ERR-P01-IDT-*`), not this one - the JWT is verified
  against the identity service. `ERR-P01-MAIL-0401` is strictly the
  service-key (PSK) gate on the cross-Worker internal surface.

## What to do

- Send the `X-Service-Key` header equal to the shared `SERVICE_KEY`. This is
  the same PSK that gates `apps/api`'s `/_admin/*` routes.
- Internal callers should reach mail via the service binding, which injects
  the key; a `401` here usually means a misconfigured binding or a rotated
  key not yet propagated.
- This route is not for external clients - end-user agents use the bearer
  `/mails` surface instead.

## Server-side cause

- Raised by: `apps/mail/src/internal/notify.ts` - the `internalRouter`
  `.use('*', ...)` guard, which calls the local `unauthorized(c, ...)` helper.
- Guard: `if (!expected) ...` (no `SERVICE_KEY`) and
  `if (!timingSafeEqual(presented, expected)) ...` (mismatch), both returning
  `401` with `code: MAIL_ERR.unauthorized`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-0401",
  "title":     "Unauthorized",
  "status":    401,
  "code":      "ERR-P01-MAIL-0401",
  "message":   "X-Service-Key missing or invalid",
  "method":    "POST",
  "instance":  "/_internal/notify",
  "request_url": "https://mail.citizenry.id/_internal/notify",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-0400`](./ERR-P01-MAIL-0400.md) - malformed JSON on the same
  `/_internal/notify` route, checked after this guard passes.

## Changelog

- 0.1.0 - introduced.
