# Contributing to Endue Citizenry

Thank you for your interest in contributing. This document explains how
to file issues, submit changes, and propose specification changes.

By contributing, you agree that your contribution is licensed under the
same license as the file you are modifying:

- Code: **Apache License 2.0** (see `LICENSE`)
- Specification under `packages/spec/`: **CC-BY-SA 4.0**
  (see `packages/spec/LICENSE`)

You also agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

---

## 1. Developer Certificate of Origin (DCO)

All contributions must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/).

The DCO is a lightweight way for contributors to certify that they
wrote or otherwise have the right to submit the contribution. It is
**not** a Contributor License Agreement (CLA); contributors retain
copyright in their contributions.

### How to sign off

Add a `Signed-off-by` line to every commit:

```
Signed-off-by: Your Name <your.email@example.com>
```

The easiest way is to use the `-s` flag with `git commit`:

```bash
git commit -s -m "Your commit message"
```

Set your git identity once with your real name and an email you can
receive mail at:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### Full DCO text

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.


Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project and the open source license(s) involved.
```

---

## 2. Filing Issues

- **Bugs** - Use the bug report template. Include reproduction steps,
  expected vs actual behavior, and version information.
- **Feature requests** - Open a discussion first if the change is
  substantial; small features can go directly to issues.
- **Security vulnerabilities** - **Do not file public issues for
  security vulnerabilities.** See `SECURITY.md` for disclosure
  process.

---

## 3. Submitting Code Changes

1. Fork the repository.
2. Create a feature branch from `main`:
   `git checkout -b feature/short-description`.
3. Make your changes following the conventions in
   [Section 5](#5-conventions).
4. Sign off every commit (`git commit -s`).
5. Push to your fork and open a pull request against `main`.
6. Fill in the pull request template.
7. Respond to review feedback. Maintainers will merge when CI passes
   and the change has at least one Maintainer approval.

### Substantial changes

If your change is substantial (new feature, architectural change, or
modifies the specification), please:

- **For specification-affecting changes**: submit an RFC first (see
  [Section 4](#4-proposing-specification-changes-rfcs)).
- **For large code changes**: open a discussion or draft PR early so
  Maintainers can give directional feedback before significant
  investment.

---

## 4. Proposing Specification Changes (RFCs)

Changes to the Endue Citizenry specification (`packages/spec/`) go
through the RFC process described in `GOVERNANCE.md` Section 4.

### Quick summary

1. Open a PR adding `rfcs/NNNN-short-title.md` using the RFC template.
2. Discuss in the PR. Spec Editors and the community will review.
3. When discussion converges, a Spec Editor proposes Final Comment
   Period (FCP), minimum 10 days.
4. At end of FCP, RFC is accepted, rejected, or postponed.
5. Accepted RFCs are tracked to implementation.

The RFC template will be added to `rfcs/0000-template.md` once the
RFC repository is initialized.

---

## 5. Conventions

### 5.1 Code style

- TypeScript: use the project's ESLint and Prettier configuration.
  Run `pnpm lint` and `pnpm typecheck` before submitting.
- Tests: include tests for new behavior. Run `pnpm test`.
- Commits: follow [Conventional Commits](https://www.conventionalcommits.org/)
  format where practical (`feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`).

### 5.2 License headers

New source files should include an SPDX license identifier at the top:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Endue
```

For specification files (`packages/spec/`):

```typescript
// SPDX-License-Identifier: CC-BY-SA-4.0
// Copyright 2026 Endue
```

### 5.3 Documentation

- Update relevant documentation when changing behavior.
- Add JSDoc comments to exported APIs.
- Update the changelog entry for the affected package.

---

## 6. Review Process

- Pull requests require at least one approval from a Maintainer.
- Changes touching `packages/spec/` additionally require approval from
  a Spec Editor.
- CI must pass: type-check, lint, tests, and build.
- After approval and green CI, a Maintainer will merge.

Reviewers aim to respond within 5 business days. If your PR is stuck,
ping in the relevant communication channel.

---

## 7. Becoming a Maintainer

Maintainership is earned through sustained, high-quality contribution
and demonstrated good judgment. The Steering Committee appoints
Maintainers; see `GOVERNANCE.md` Section 2.3.

If you are interested in deeper involvement, the best path is simply
to contribute consistently, help review others' PRs, and engage in
discussions.

---

## 8. Questions

- General contributor questions: open a GitHub Discussion.
- Governance questions: `team@endue.ai`
- Code of conduct concerns: see `CODE_OF_CONDUCT.md`
- Security issues: see `SECURITY.md`

Thank you for contributing.
