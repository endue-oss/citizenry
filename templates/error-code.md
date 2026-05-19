---
code: ERR-P##-XXX-NNNN
title: <short title — match `BaseError.title`>
http_status: 4xx
category: <auth | schema | business | external | invariant | domain | transport | fallback>
since: 0.x.0
deprecated_since:
alias_for:
related:
  - ERR-...
---

# `{{code}}` — {{title}}

## Summary

<One short sentence describing what this code means. Caller-facing.>

## When this is raised

<Bullet list of the exact conditions under which the server emits this code.
Be precise — name claims, fields, states. The list should let a reader
predict whether a given request will produce this code.>

- ...
- ...

## What to do

<Caller-side remediation. If the answer is "fix your token / fix your input",
say which field. If the answer is "retry", say with what backoff. If the
answer is "contact support", say so explicitly.>

## Server-side cause

<Where in the code the error is raised. File path + brief explanation of the
guard. Lets future maintainers find it.>

- Raised by: `packages/<…>/src/<…>.ts:<…>`
- Guard: ...

## Example response

```json
{
  "type":      "https://citizenry.id/errors/{{code}}",
  "title":     "{{title}}",
  "status":    {{http_status}},
  "code":      "{{code}}",
  "message":   "<message string the server actually emits>",
  "detail":    { },
  "method":    "GET",
  "instance":  "/v1/...",
  "request_url": "https://api.citizenry.id/v1/...",
  "timestamp": "2026-05-17T00:00:00.000Z"
}
```

## Related codes

- [`ERR-…`](./ERR-….md) — <one-line relation>

## Changelog

- {{since}} — introduced.
