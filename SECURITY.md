# Security Policy

The **Endue Citizenry** project handles identity, authentication, and
secret material. We take security seriously and welcome responsible
disclosure of vulnerabilities.

---

## Supported Versions

| Version | Supported |
|---|---|
| latest minor on `main` | ✓ |
| previous minor | ✓ (critical fixes only) |
| older | ✗ |

Specific long-term-support (LTS) versions, if introduced, will be
listed here with their support end dates.

---

## Reporting a Vulnerability

**Please do not file public issues, pull requests, or discussions for
security vulnerabilities.**

Report vulnerabilities privately via one of the following:

- **Preferred — GitHub Private Vulnerability Reporting:**
  Use the "Report a vulnerability" button in the repository's Security
  tab. This routes directly to the security response team.
- **Email:** `security@citizenry.dev`
  - Optionally encrypt with the project's PGP key published at
    `https://citizenry.dev/.well-known/security.txt`.

### What to include

- A description of the issue and its impact.
- Steps to reproduce (proof of concept, if possible).
- Affected versions or commit ranges.
- Any known mitigations or workarounds.
- Whether you would like public credit in the eventual advisory, and
  under what name / handle.

---

## Our Response Process

1. **Acknowledge** — We acknowledge receipt within **3 business days**.
2. **Triage** — We confirm the issue and assess severity (CVSS) within
   **10 business days**.
3. **Fix** — We develop a fix in a private branch.
4. **Coordinate** — For high-severity issues, we may coordinate
   disclosure with downstream packagers, hosting partners, and
   certified implementations.
5. **Release** — We release a patched version and publish an advisory.
6. **Credit** — Reporters are credited in the advisory unless they
   request otherwise.

### Target timelines by severity

| Severity (CVSS) | Target disclosure window |
|---|---|
| Critical (9.0–10.0) | 7–30 days |
| High (7.0–8.9) | 30–60 days |
| Medium (4.0–6.9) | 60–90 days |
| Low (< 4.0) | next regular release |

These are targets, not guarantees; complex issues may take longer.

---

## Disclosure Policy

We follow coordinated disclosure. Once a fix is available and has been
rolled out to a reasonable portion of the user base (or after the
target disclosure window, whichever comes first), the advisory is
published publicly, including:

- CVE identifier (we request CVEs for qualifying issues).
- Affected versions.
- Impact and CVSS score.
- Mitigations.
- Patches and upgrade paths.
- Credit to the reporter.

Advisories are published at:

- The repository's GitHub Security Advisories page.
- `https://citizenry.dev/security/advisories`

---

## Scope

This policy covers:

- The Endue Citizenry reference implementation (this repository).
- The Endue Citizenry specification (`packages/spec/`).
- The Endue Citizenry conformance test suite (when published).
- Official packages and SDKs published by Endue.

**Out of scope:**

- Third-party forks, modifications, or implementations not certified
  by the Endue Citizenry Conformance Program.
- Vulnerabilities in dependencies (please report those upstream; we
  will coordinate updates).
- Issues in services hosted by third parties that use Endue Citizenry.
- Social engineering of project members.
- Denial-of-service via resource exhaustion that requires resource
  parameters outside documented production guidance.

---

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to comply with this policy.
- Avoid privacy violations, destruction of data, and interruption or
  degradation of services.
- Do not exploit a vulnerability beyond what is necessary to
  demonstrate it.
- Give us a reasonable opportunity to address the issue before
  disclosing it publicly.

If you are unsure whether your planned research is within the spirit
of this policy, contact `security@citizenry.dev` first.

---

## Contact

- **Vulnerability reports:** `security@citizenry.dev`
- **PGP key:** `https://citizenry.dev/.well-known/security.txt`
- **General security questions (non-vulnerability):**
  `security@citizenry.dev`
