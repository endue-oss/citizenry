import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Identity (P01-S01) error code catalog.
//
// Format: `{LEVEL}-P01-S01-{NNNN}` — LEVEL ∈ {ERR, WARN, INFO}.
// This enum lists ERR codes only (the ones exposed in response bodies).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Identity (P01-S01) error code catalog (ERR only).
 *
 * @status confirmed
 */
enum IdentityErrorCode {
  // ── 0xxx Transport / HTTP ─────────────────────────────
  /** 400 — malformed request body / query */
  bad_request: "ERR-P01-S01-0400",
  /** 401 — missing or failed authentication (catch-all) */
  unauthorized: "ERR-P01-S01-0401",
  /** 404 — resource not found (agent / human / key) */
  not_found: "ERR-P01-S01-0404",
  /** 409 — conflict (e.g. slug duplicate) */
  conflict: "ERR-P01-S01-0409",
  /** 410 — verification window expired (e.g. email verification) */
  gone: "ERR-P01-S01-0410",
  /** 429 — rate limited */
  rate_limited: "ERR-P01-S01-0429",
  /** 500 — internal error */
  internal: "ERR-P01-S01-0500",
  /** 503 — backend unavailable */
  unavailable: "ERR-P01-S01-0503",

  // ── 1xxx Auth (JWT / JWS / PSK / verification code) ──
  /** Human email-verification code did not match the stored hash */
  human_verification_code_invalid: "ERR-P01-S01-1100",
  /** JWT alg ≠ EdDSA */
  jwt_alg_mismatch: "ERR-P01-S01-1001",
  /** JWT aud mismatch (not `api.citizenry.id` / `citizenry-id`) */
  jwt_aud_mismatch: "ERR-P01-S01-1002",
  /** JWT exp expired */
  jwt_expired: "ERR-P01-S01-1003",
  /** JWT kid unknown or revoked */
  jwt_kid_unknown: "ERR-P01-S01-1004",
  /** JWS replay (duplicate jti) */
  jws_replay: "ERR-P01-S01-1010",
  /** JWS payload action mismatch */
  jws_action_mismatch: "ERR-P01-S01-1011",
  /** JWS lifetime exceeded (`exp - iat > recommended max`) */
  jws_lifetime_exceeded: "ERR-P01-S01-1012",
  /** Service PSK verification failed (`X-Service-Key`) */
  psk_invalid: "ERR-P01-S01-1020",

  // ── 2xxx Schema / input validation ───────────────────
  /** public_key_jwk malformed (kty/crv/length, etc.) */
  jwk_invalid: "ERR-P01-S01-2001",
  /** slug pattern violation */
  slug_invalid: "ERR-P01-S01-2002",
  /** tenant value outside the enum */
  tenant_invalid: "ERR-P01-S01-2003",
  /** Submitted email's domain is outside the operator-configured allow-list (400) */
  email_domain_not_allowed: "ERR-P01-S01-2004",

  // ── 3xxx Business rules ──────────────────────────────
  /** rotate-key signed by a key that is not active */
  key_not_active: "ERR-P01-S01-3001",
  /** revoked agent called a self-service route */
  agent_revoked: "ERR-P01-S01-3002",
  /** A verified human already owns the supplied email (409) */
  human_email_already_active: "ERR-P01-S01-3100",
  /** A pending registration for the supplied email is still alive (409) */
  human_email_already_pending: "ERR-P01-S01-3101",
  /** Attempt to verify a human that is already verified (409) */
  human_already_verified: "ERR-P01-S01-3102",

  // ── 4xxx External dependencies ───────────────────────
  /** Postgres query failure */
  db_failure: "ERR-P01-S01-4001",

  // ── 7xxx Domain-specific ─────────────────────────────
  /** Human email-verification window (30 min) has elapsed (410) */
  human_verification_expired: "ERR-P01-S01-7200",
  /** Resend requested before the arithmetic backoff cleared (429) */
  human_resend_too_soon: "ERR-P01-S01-7201",
}
