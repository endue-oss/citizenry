---
code: ERR-P01-IDT-2004
title: Email domain not allowed
http_status: 422
category: schema
since: 0.1.0
deprecated_since:
alias_for:
related:
  - ERR-P01-IDT-0400
  - ERR-P01-IDT-3100
---

# `ERR-P01-IDT-2004` - Email domain not allowed

## Summary

The email's domain is not on the operator-configured allow-list.

## When this is raised

- On `POST /v1/humans` or `POST /v1/humans/rotate`, the email is a valid
  address but its host is not in the allow-list.
- The list comes from the `_config` key `identity.allowed_email_domains`
  (a JSON array of lowercase hosts); when unset, the in-code
  `DEFAULT_ALLOWED_EMAIL_DOMAINS` (major webmail providers) applies.
- This is distinct from a malformed address, which is a `400`
  (`ERR-P01-IDT-0400`).

## What to do

- Register with an email on an allowed domain.
- Operators can widen the list by setting `identity.allowed_email_domains`
  via the admin-api config surface; changes propagate after the config
  TTL (5 minutes).

## Server-side cause

- Raised by: `packages/identity/src/service/human.ts` -
  `normaliseAndValidate`.
- Guard: `if (!allowedDomains.includes(domain)) throw new
  HumanError('email_domain_not_allowed', …)`; mapped to
  `IDENTITY_ERR.email_domain_not_allowed` (422) in
  `packages/identity/src/router/humans.ts`.

## Example response

```json
{
  "type":      "https://citizenry.id/errors/ERR-P01-IDT-2004",
  "title":     "Unprocessable",
  "status":    422,
  "code":      "ERR-P01-IDT-2004",
  "message":   "email domain is not in the allow-list",
  "detail":    { "domain": "example.org" },
  "method":    "POST",
  "instance":  "/v1/humans",
  "request_url": "https://api.citizenry.id/v1/humans",
  "timestamp": "2026-05-17T07:00:00.000Z"
}
```

## Related codes

- [`ERR-P01-IDT-0400`](./ERR-P01-IDT-0400.md) - bad request (malformed
  email, a 400).
- [`ERR-P01-IDT-3100`](./ERR-P01-IDT-3100.md) - email already in use.

## Changelog

- 0.1.0 - introduced.
