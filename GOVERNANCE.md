# Governance

**Version 1.0 — Effective 2026**

This document describes how the **Endue Citizenry** project is governed:
who makes decisions, how changes to the specification and code are
proposed and approved, and how the Endue Citizenry Conformance Program
operates.

The Project is sponsored and stewarded by **Endue**, the founding
organization. This governance model is designed to support broad
community participation while preserving the integrity of the Endue
Citizenry specification, brand, and conformance program.

---

## 1. Project Scope

The Project consists of:

- **Specification** (`packages/spec/`) — TypeSpec sources defining the
  Endue Citizenry protocol, types, and APIs. Licensed under
  CC-BY-SA 4.0.
- **Reference implementation** — Apps and packages implementing the
  specification. Licensed under Apache License 2.0.
- **Conformance test suite** (`packages/conformance/` once introduced) —
  Tests that determine whether an implementation is conformant.
  Licensed under Apache License 2.0; the conformance mark is governed
  separately (see Section 5).
- **Marks** — The Endue and Endue Citizenry trademarks. See
  `TRADEMARKS.md`.

---

## 2. Roles

### 2.1 Users

Anyone who uses Endue Citizenry, in any form. Users participate by
filing issues, asking questions, contributing documentation, and
sharing feedback.

### 2.2 Contributors

Anyone who submits a contribution (code, documentation, RFC, test,
translation, design) to the Project, regardless of whether it is
merged. Contributors must follow `CONTRIBUTING.md` (including DCO
sign-off).

### 2.3 Maintainers

Individuals with write access to the Project repositories. Maintainers
review and merge contributions, triage issues, and uphold project
standards. Maintainers are appointed by the Steering Committee based on
demonstrated commitment and quality of contribution.

### 2.4 Spec Editors

A subset of Maintainers with authority to merge changes to
`packages/spec/`. Spec Editors are appointed by the Steering Committee
and act as stewards of the specification.

### 2.5 Steering Committee

The body responsible for project-level decisions: roadmap, governance
changes, maintainer appointments, conformance program oversight, and
disputes that cannot be resolved by Maintainers.

**Initial composition (2026):** The Steering Committee is composed of
representatives appointed by Endue. As the community matures, the
Committee will expand to include community-elected members per the
schedule in Section 8.

### 2.6 Project Sponsor

**Endue** is the Project Sponsor and holds:

- The Endue and Endue Citizenry trademarks (see `TRADEMARKS.md`).
- The right to operate and administer the Endue Citizenry Conformance
  Program (see Section 5).
- The right to operate official infrastructure (citizenry.dev,
  registries, conformance services).

These rights are independent of the governance of code and specification
contributions, which follow the processes in Sections 3 and 4.

---

## 3. Code Contributions

Code contributions follow a standard open source review process:

1. Contributor opens a pull request against the appropriate repository.
2. PR must include a Developer Certificate of Origin (DCO) sign-off on
   each commit (`Signed-off-by:` line). See `CONTRIBUTING.md`.
3. At least one Maintainer reviews and approves.
4. Continuous integration (build, tests, type-check, lint) must pass.
5. A Maintainer merges.

Substantial changes (new features, architectural changes, breaking
changes) require either:

- An accepted RFC (see Section 4), or
- Approval from two Maintainers, at least one of whom is a Spec Editor
  if the change touches the specification surface.

---

## 4. Specification Changes (RFC Process)

Changes to the Endue Citizenry specification are managed through an
RFC (Request for Comments) process. This ensures the specification
evolves in a deliberate, transparent, and backwards-aware manner.

### 4.1 When an RFC is required

An RFC is required for:

- New protocol features, endpoints, or message types.
- Changes to existing protocol semantics, even if non-breaking.
- Deprecations and removals of specification surface.
- New mandatory conformance requirements.
- Cross-cutting architectural changes that span multiple packages.

Editorial fixes (typos, clarifications, formatting) do not require an
RFC and may be merged by Spec Editors directly.

### 4.2 RFC lifecycle

1. **Draft** — Author opens a PR adding `rfcs/NNNN-short-title.md`
   based on the RFC template. Discussion happens in the PR.
2. **Final Comment Period (FCP)** — When a Spec Editor judges that
   discussion has converged, they propose FCP. The RFC enters a
   minimum 10-day FCP, announced in the project's official channels.
3. **Decision** — At the end of FCP, the RFC is either:
   - **Accepted** — Merged into `rfcs/`, becomes part of the
     specification roadmap.
   - **Rejected** — Closed with a written rationale.
   - **Postponed** — Closed with a note that the idea is valuable but
     not for this iteration.
4. **Implementation** — Accepted RFCs are tracked to implementation,
   with implementing PRs referencing the RFC number.

### 4.3 Decision authority for RFCs

- **Acceptance** of an RFC requires consensus of Spec Editors. If
  consensus cannot be reached, the Steering Committee decides by simple
  majority.
- **Breaking changes** to the specification require Steering Committee
  approval in addition to Spec Editor consensus.

### 4.4 Versioning

The specification follows semantic versioning at the protocol level:

- **Major** — Breaking changes (Steering Committee approval required).
- **Minor** — Backwards-compatible additions.
- **Patch** — Editorial fixes and clarifications.

The reference implementation versions independently but must indicate
which specification version it implements.

---

## 5. Endue Citizenry Conformance Program

The Conformance Program ensures that implementations claiming Endue
Citizenry compatibility behave consistently for users.

### 5.1 Conformance Test Suite

- Open source under Apache License 2.0.
- Maintained alongside the specification.
- Versioned in lockstep with specification minor/major releases.

### 5.2 Certification

- Any implementer (commercial, open source, public cloud, individual)
  may submit their implementation for certification.
- Certification consists of (a) passing the conformance test suite for
  a specified specification version, and (b) entering a conformance
  mark agreement with Endue.
- Certified implementations may use the "Endue Citizenry Certified" mark
  and appear in the official directory at `citizenry.dev/certified`.

### 5.3 Fees

- The conformance test suite itself is freely available and freely
  runnable.
- Endue may charge a nominal certification administration fee to cover
  program costs. The fee schedule is published at
  `citizenry.dev/conformance` and is designed to be accessible (with
  reduced or waived fees for individuals, students, and small
  open source projects).

### 5.4 Compatibility claims without certification

Implementations may make truthful compatibility statements
(e.g., *"Compatible with Endue Citizenry Protocol v1.x"*) without
entering the Conformance Program, as described in `TRADEMARKS.md`
Section 3.2.

---

## 6. Decision-Making Principles

The Project aims to make decisions in this order of preference:

1. **Lazy consensus** — If a proposal is made and no one objects within
   a reasonable time, it is accepted.
2. **Explicit consensus** — Maintainers or Spec Editors signal
   agreement; objections are resolved through discussion.
3. **Steering Committee vote** — Used when consensus cannot be reached
   or when the matter is reserved for the Committee (governance
   changes, trademark policy, conformance program changes, breaking
   spec changes).

All votes are documented in writing.

---

## 7. Changes to Governance

This governance document may be changed by a 2/3 majority of the
Steering Committee. Material changes are announced via the Project's
official channels and effective on a stated date.

Changes to the `TRADEMARKS.md` policy or to the Conformance Program
structure require Project Sponsor (Endue) approval in addition to
Steering Committee approval, as these touch rights held by the Sponsor.

---

## 8. Community Maturity Path

The Project is committed to broadening community participation over
time. The intended evolution:

- **Year 0–1 (2026)** — Steering Committee composed of Endue
  representatives. Maintainers and Spec Editors appointed based on
  contribution.
- **Year 1–2** — At least 2 community-elected seats added to the
  Steering Committee. Spec Editor pool expanded to include non-Endue
  contributors.
- **Year 2+** — Evaluate transition to a neutral foundation
  (e.g., CNCF, Linux Foundation) for code and specification governance,
  with the trademark and conformance program remaining with Endue or
  transferred under terms protecting brand integrity (Kubernetes/CNCF
  model).

Trademark ownership and conformance program administration are not
subject to community handover and remain with Endue regardless of
governance evolution, in order to preserve the integrity of the marks
and the consistency of certification.

---

## 9. Contact

- **Governance questions**: `team@endue.ai`
- **Security disclosures**: see `SECURITY.md`
- **Trademark questions**: `team@endue.ai`
- **Conformance program**: `team@endue.ai`
- **Partnership inquiries**: `team@endue.ai`
