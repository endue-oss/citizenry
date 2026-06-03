---
code: ERR-P01-MAIL-2002
title: From Required
http_status: 400
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-2001
---

# `ERR-P01-MAIL-2002` - From Required

## Summary

`POST /mails` could not resolve a From address for the outbound message.

## When this is raised

- The request omits `from`, and the router has no default From address to
  fall back to (`defaultFromAddr` is unset or empty), so the resolved
  `from.mail` is missing.
- In normal operation `apps/mail` injects a default of
  `${accountId}@<MAIL_DOMAIN>`, so this fires only when that default was not
  set - e.g. a misconfigured `MAIL_DOMAIN` or a caller path that bypasses the
  default-From middleware.
- The body has already passed the `sendBody` schema (`ERR-P01-MAIL-2001`);
  this is the next check, specific to sender resolution.

## What to do

- Include an explicit `from` object with a valid `mail` field in the request
  body.
- If you expected the server to default the From address, report it to the
  operator - `MAIL_DOMAIN` or the default-From middleware is likely
  misconfigured.
- No message is sent when this fires; fix the From and resend.

## Server-side cause

- Raised by: `packages/mail/src/router/index.ts` - the `POST /mails` handler,
  after schema validation: `if (!from?.mail) throw MAIL.fromRequired('from
  address is required')`.
- Guard: `from` is `body.from` falling back to `{ mail: defaultFromAddr }`;
  when neither yields a `mail`, the guard throws.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-2002",
  "title":     "Bad Request",
  "status":    400,
  "code":      "ERR-P01-MAIL-2002",
  "message":   "from address is required",
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-2001`](./ERR-P01-MAIL-2001.md) - the body-shape validation
  that runs immediately before this From-resolution check.

## Changelog

- 0.1.0 - introduced.
