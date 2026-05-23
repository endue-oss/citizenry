import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Human self-registration with email verification
//
// Three endpoints; nothing else.
//
//   1. POST /v1/humans          { email, display_name? }
//        → 202; mails a 6-digit code. Fresh-email only — 409 on
//          existing pending or active rows.
//
//   2. POST /v1/humans/rotate   { email }
//        → 202; mails a fresh code for an *active* human so they can
//          mint a replacement API-Key. Always 202 (oracle-safe).
//
//   3. POST /v1/humans/verify   { email, code }
//        → 201 { human_id, api_key }. Consumes the most recent
//          verification row matching `email`; flips the human to
//          `active` (if first verify) AND mints exactly one new
//          API-Key, revoking any other active key for the owner in
//          the same transaction. The raw `chk_<…>` token is surfaced
//          once in this response; it is never emailed.
//
// All three are unauthenticated — the email round-trip is the
// credential. Rate-limited per email + per IP (2/min, 15/day).
//
// Removed in this iteration (see RFC-0004):
//   • POST /v1/humans/{id}/verify, .../verify/resend
//   • POST /v1/humans/{id}/api-key/{issue,revoke}
//   • GET  /v1/humans?email=…  (moved to /_admin/v1/humans)
//   • GET  /v1/humans/{id}/verify  magic-link variant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Human registration request — fresh email only. If a row already
 * exists (pending or active), respond 409; rotation lives at
 * `POST /v1/humans/rotate`.
 *
 * @status draft
 */
model HumanCreateRequest {
  /** RFC 5322 addr-spec. Normalised to lowercase server-side. */
  email: string;

  /** Optional display name. */
  display_name?: string;
}

/**
 * Human registration response — a verification email is on its way.
 * The response is intentionally thin: no human id, no notify-status,
 * no can_resend_at. The next step is always `/v1/humans/verify`.
 *
 * @status draft
 */
model HumanCreateResponse {
  /** Absolute deadline of the verification window (created_at + 30 min). */
  expires_at: iso8601;
}

/**
 * Rotation trigger — re-mails a verification code to the active
 * human so they can replace their API-Key. Returns 202 with the
 * same shape regardless of whether the email maps to a verified
 * row (oracle-safe). If the email is unknown, the call is silently
 * a no-op; the email is never sent.
 *
 * @status draft
 */
model HumanRotateRequest {
  /** RFC 5322 addr-spec. Normalised to lowercase server-side. */
  email: string;
}

/**
 * Always-202 response for rotate triggers.
 * @status draft
 */
model HumanRotateResponse {
  /** Absolute deadline of the verification window (created_at + 30 min). */
  expires_at: iso8601;
}

/**
 * Submit the 6-digit verification code along with the email it was
 * mailed to. Path carries no id; the server resolves by email so the
 * `hu_<ULID>` never appears in URL logs.
 *
 * @status draft
 */
model HumanVerifyRequest {
  /** Same email the code was mailed to. */
  email: string;
  /** 6-digit numeric code from the verification email. */
  code: string;
}

/**
 * Successful verification result. Returns the human's id and a
 * freshly-minted API-Key. Any prior active API-Key for the same
 * owner is revoked in the same transaction (single active key per
 * human invariant).
 *
 * @status draft
 */
model HumanVerifyResponse {
  human_id: humanId;
  /** `chk_<…>` — surfaced exactly once. */
  api_key: string;
  /** API-Key absolute expiry. `null` when the key has no expiry. */
  expires_at: iso8601 | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tag("Humans")
@route("/v1/humans")
@useAuth(NoAuth)
interface Humans {
  /**
   * Start a human registration. Fresh-email only — pending or
   * active rows raise 409.
   *
   * Possible errors: 400 (bad email), 409 (email already in use),
   * 422 (domain not in allow-list), 429 (rate-limited), 500.
   */
  @summary("Start human registration with email verification")
  @operationId("human-create")
  @post create(@body body: HumanCreateRequest):
    | {
        @statusCode statusCode: 202;
        @body body: HumanCreateResponse;
      }
    | BadRequestError
    | ConflictError
    | UnprocessableError
    | RateLimitedError
    | InternalError;

  /**
   * Mail a fresh verification code so an active human can mint a
   * replacement API-Key. Always 202; unknown emails silently drop.
   *
   * Possible errors: 400 (bad email), 429 (rate-limited), 500.
   */
  @summary("Trigger an API-Key rotation email")
  @operationId("human-rotate")
  @route("rotate")
  @post rotate(@body body: HumanRotateRequest):
    | {
        @statusCode statusCode: 202;
        @body body: HumanRotateResponse;
      }
    | BadRequestError
    | RateLimitedError
    | InternalError;

  /**
   * Submit a verification code. On success the human is `active` and
   * the response carries exactly one API-Key (any prior active key
   * for the owner is revoked atomically).
   *
   * All failure modes (no such email / no pending verification / wrong
   * code / expired window) collapse into a single 401 with code
   * `ERR-P01-S01-1100` to prevent enumeration.
   *
   * Possible errors: 401, 429, 500.
   */
  @summary("Submit code; mint or rotate the human's API-Key")
  @operationId("human-verify")
  @route("verify")
  @post verify(@body body: HumanVerifyRequest):
    | {
        @statusCode statusCode: 201;
        @body body: HumanVerifyResponse;
      }
    | UnauthorizedError
    | RateLimitedError
    | InternalError;
}
