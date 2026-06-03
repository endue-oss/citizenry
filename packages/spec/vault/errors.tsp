import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Vault;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vault (P01-S03) error code catalog.
//
// Format: `{LEVEL}-P01-S03-{NNNN}` — LEVEL ∈ {ERR, WARN, INFO}.
// This enum lists ERR codes only (the ones exposed in response bodies).
//
// Bearer JWT failures (agent surface) and X-Service-Key failures (admin
// surface) emit identity (S01) codes — both are verified by the shared
// api auth middleware against the identity service, not by Vault. Vault
// (S03) codes cover transport, blob-size validation, lookup, and storage.
// The service never inspects payloads, so there is no 422 domain rule;
// an oversized blob is a transport concern (413), not a schema one.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Vault (P01-S03) error code catalog (ERR only).
 *
 * @status draft
 */
enum VaultErrorCode {
  // ── 0xxx Transport / HTTP ─────────────────────────────
  /** 400 — malformed request body / query */
  bad_request: "ERR-P01-S03-0400",
  /** 401 — missing or failed authentication (catch-all) */
  unauthorized: "ERR-P01-S03-0401",
  /** 404 — entry not found, or owned by another principal (no existence oracle) */
  not_found: "ERR-P01-S03-0404",
  /** 413 — entry blob exceeds the maximum size */
  payload_too_large: "ERR-P01-S03-0413",
  /** 429 — rate limited */
  rate_limited: "ERR-P01-S03-0429",
  /** 500 — internal error */
  internal: "ERR-P01-S03-0500",
  /** 503 — backend (D1) unavailable */
  unavailable: "ERR-P01-S03-0503",

  // ── 2xxx Schema / input validation ───────────────────
  /** POST /vault/entries — body failed validation (missing or empty `data`) */
  invalid_body: "ERR-P01-S03-2001",

  // ── 4xxx External dependencies ───────────────────────
  /** D1 query failure */
  db_failure: "ERR-P01-S03-4001",
}
