# Citizenry RFCs

> Substantial changes to the Endue Citizenry **specification** — wire
> protocol, public types, error contracts, conformance requirements — go
> through the **RFC (Request for Comments)** process defined in
> [`GOVERNANCE.md` §4](../../GOVERNANCE.md#4-specification-changes-rfc-process).

This directory is the canonical home of those documents.

---

## When is an RFC required?

From `GOVERNANCE.md` §4.1:

- New protocol features, endpoints, or message types.
- Changes to existing protocol semantics, even if non-breaking.
- Deprecations and removals of specification surface.
- New mandatory conformance requirements.
- Cross-cutting architectural changes that span multiple packages.

Editorial fixes (typos, clarifications, formatting) do **not** require an
RFC and may be merged by Spec Editors directly.

> **RFC vs ADR.** RFCs change what *external integrators* see; ADRs record
> *internal* decisions. If your change affects only how citizenry's source
> code is organised, write an ADR ([`docs/adr/`](../adr/)) instead.

---

## Lifecycle

```
draft → proposed → final_comment_period (≥ 10 days) → accepted | rejected | postponed
                                                            ↓
                                                       implementation
                                                            ↓
                                                       (eventually) superseded
```

Mirrors `GOVERNANCE.md` §4.2 verbatim. Status transitions are recorded in
the RFC's front-matter.

### Status values

| Status | Meaning |
|---|---|
| `draft` | Author is still drafting; no review yet. |
| `proposed` | PR open for community comment. |
| `final_comment_period` | Spec Editor has called FCP; counts down ≥ 10 days. |
| `accepted` | FCP closed; consensus reached. Tracked to implementation. |
| `rejected` | Closed with written rationale. |
| `postponed` | Valuable idea, not for this iteration. |
| `superseded` | A later RFC replaces this one (see `superseded_by`). |

---

## Numbering and filenames

- IDs are **continuous integers**, zero-padded to 4 digits: `0001`, `0002`, …
  No year prefix — RFC identifiers are permanent external references.
- Filenames: `<NNNN>-<kebab-case-title>.md`, e.g.
  `0042-tenant-scoped-issuer-keys.md`.
- IDs are allocated **at PR open time**, not at draft time. To allocate the
  next id, run `/docs create rfc "<title>"` from the repo root or look at
  the highest existing number and add 1.
- Once allocated, an id is permanent. Withdrawn RFCs keep their id; we never
  reuse one.

---

## Authoring an RFC

1. **Scaffold** the file with [`/docs create rfc "<title>"`](../../templates/rfc.md)
   (or copy [`templates/rfc.md`](../../templates/rfc.md) by hand).
2. **Fill in** every section. Examples in *Guide-level explanation* are
   mandatory; "I couldn't think of any drawbacks" is acceptable but signals
   reviewers to push back.
3. **Open a PR** against this directory. Discussion happens in the PR.
4. When a **Spec Editor judges that discussion has converged**, they
   propose FCP. Update `status: final_comment_period`, fill `fcp_start` and
   `fcp_end` (start + 10 days), and announce on the project's official
   channel.
5. **At FCP close**: a Spec Editor (or the Steering Committee on
   disagreement, per §4.3) marks the RFC `accepted`, `rejected`, or
   `postponed`, and writes a closing comment summarising the rationale.
6. **Implementation** PRs reference the RFC id (e.g. `Implements RFC-0042`).

### Required front-matter

```yaml
id: 0042
title: Tenant-scoped issuer keys
status: draft               # see status table above
authors:
  - "@endue-oss"
date_proposed: 2026-05-17
date_accepted:              # set when accepted
fcp_start:                  # set when FCP begins
fcp_end:                    # date_proposed + 10 days when FCP begins
implementation_pr:          # link or PR number
supersedes:                 # RFC id if applicable
superseded_by:              # RFC id if applicable
tags:
  - identity
```

### Required sections

`Summary`, `Motivation`, `Guide-level explanation`,
`Reference-level explanation`, `Drawbacks`,
`Rationale and alternatives`, `Prior art`, `Unresolved questions`,
`Future possibilities`, `References`.

---

## Decision authority

Per `GOVERNANCE.md` §4.3:

- **Acceptance** requires consensus of Spec Editors. If consensus cannot be
  reached, the Steering Committee decides by simple majority.
- **Breaking changes** to the specification require Steering Committee
  approval *in addition to* Spec Editor consensus.

---

## RFC index

> Maintained alphabetically by status. PR that lands a new RFC, transitions
> status, or sets `superseded_by` MUST also update this index.

### Active (`draft` / `proposed` / `final_comment_period`)

- [`0001`](./0001-federation-peers.md) — Federation between Citizenry
  instances via peer ↔ tenant mapping. (`draft`)

### Accepted

*(none yet)*

### Implemented

*(none yet)*

### Rejected

*(none yet)*

### Postponed

*(none yet)*

### Superseded

*(none yet)*

---

## References

- [`GOVERNANCE.md` §4](../../GOVERNANCE.md) — full RFC process.
- [`templates/rfc.md`](../../templates/rfc.md) — RFC template.
- [`docs/adr/`](../adr/) — Architecture Decision Records (internal).
- [Rust RFC template](https://github.com/rust-lang/rfcs/blob/master/0000-template.md) — prior art.
- [Ember RFC process](https://github.com/emberjs/rfcs) — prior art.
