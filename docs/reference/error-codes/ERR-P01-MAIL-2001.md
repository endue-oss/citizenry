---
code: ERR-P01-MAIL-2001
title: Invalid Body
http_status: 400
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-MAIL-2002
  - ERR-P01-MAIL-0400
---

# `ERR-P01-MAIL-2001` - Invalid Body

## Summary

The `POST /mails` body parsed as JSON but failed the send-request schema.

## When this is raised

- The JSON body of `POST /mails` fails the zod `sendBody` schema. Common
  causes:
  - `to` missing, empty, or longer than 50 entries.
  - any address with a `mail` that is not a valid email, or a `name` over
    255 characters.
  - `subject` missing, empty, or longer than 998 characters.
  - `cc` / `bcc` over 50 entries, or `replyTo` over 10.
- The flattened zod issue list is attached under `detail.issues` so the
  caller can see exactly which fields failed.
- Distinct from `ERR-P01-MAIL-0400`, which fires earlier when the body is not
  even valid JSON.

## What to do

- Fix the offending fields named in `detail.issues` and resend. The body is
  rejected before any send is attempted, so no message was dispatched.
- Ensure every `to` / `cc` / `bcc` / `replyTo` entry has a syntactically
  valid `mail`, and that `subject` and at least the addressing fields are
  present.
- This is a caller bug; retrying the identical body fails identically.

## Server-side cause

- Raised by: `packages/mail/src/router/index.ts` - the `POST /mails` handler,
  `if (!parsed.success) throw MAIL.invalidBody('request body failed
  validation', { issues: parsed.error.flatten() })`.
- Guard: `sendBody.safeParse(...)` over the `addressSchema` array and string
  constraints declared at the top of the router.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-MAIL-2001",
  "title":     "Bad Request",
  "status":    400,
  "code":      "ERR-P01-MAIL-2001",
  "message":   "request body failed validation",
  "detail":    { "issues": { "fieldErrors": { "to": ["Array must contain at least 1 element(s)"] }, "formErrors": [] } },
  "method":    "POST",
  "instance":  "/mails",
  "request_url": "https://mail.citizenry.id/mails",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-MAIL-2002`](./ERR-P01-MAIL-2002.md) - body is valid but no From
  address could be resolved.
- [`ERR-P01-MAIL-0400`](./ERR-P01-MAIL-0400.md) - body is not valid JSON at
  all (internal-surface counterpart).

## Changelog

- 0.1.0 - introduced.
