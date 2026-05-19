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
// Flow (see ADR-2026-0005):
//   1. POST /v1/humans                  — start, code sent via mail Worker
//   2. POST /v1/humans/:id/verify       — submit 6-digit code
//   3. POST /v1/humans/:id/verify/resend — re-request code (rate-limited)
//
// All routes are unauthenticated — the email round-trip is the
// credential. Once verified, the `hu_<ULID>` is consumable as
// `owner_human_principal_id` on POST /v1/enrollments.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Human registration request (1).
 *
 * The server normalises `email` to lowercase and trims whitespace.
 * Duplicate-email handling:
 *   - active human exists → 409 (human_email_already_active)
 *   - pending verification alive → 409 (human_email_already_pending)
 *   - pending but expired → silently reaped and a fresh code is sent
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
 * Human registration response (1) — the row is in
 * `pending_verification` status. The recipient must call
 * `/verify` with the code before the row becomes usable.
 *
 * @status draft
 */
model HumanCreateResponse {
  id: humanId;
  email: string;
  status: "pending_verification";

  /** Absolute deadline (created_at + 30 min). */
  expires_at: iso8601;

  /** Earliest moment at which `/verify/resend` will succeed. */
  can_resend_at: iso8601;

  /** Audit row id of the dispatched verification email. */
  notify_outbound_log_id: string;
  /** Send status — `sent` / `failed` / `invalid_request` / `queued`. */
  notify_status: string;
}

/**
 * Submit the 6-digit verification code.
 * @status draft
 */
model HumanVerifyRequest {
  /** 6-digit numeric code from the verification email. */
  code: string;
}

/**
 * Response after successful verification — the human is now `active`
 * and can be referenced from `POST /v1/enrollments`.
 *
 * @status draft
 */
model HumanVerifyResponse {
  id: humanId;
  email: string;
  status: "active";
  verified_at: iso8601;
}

/**
 * Response after a resend request.
 * @status draft
 */
model HumanResendResponse {
  id: humanId;
  email: string;

  /** How many times the code has been re-sent (excludes the initial). */
  resend_count: int32;

  /** Earliest moment the next resend will succeed. */
  can_resend_at: iso8601;

  /** The 30-min hard expiry — unchanged by resends. */
  expires_at: iso8601;

  notify_outbound_log_id: string;
  notify_status: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes — unauthenticated (the email round-trip is the credential)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@tag("Humans")
@route("/v1/humans")
@useAuth(NoAuth)
interface Humans {
  /**
   * Start a human registration. Dispatches a 6-digit code to `email`
   * via the mail Worker (`/_internal/notify` template
   * `human_verification`). Always returns 202 — the response's
   * `notify_status` carries the outcome of the dispatch.
   *
   * Possible errors: 400, 409 (email conflict), 500.
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
    | InternalError;

  /**
   * Submit the verification code. On success flips
   * `human.status='active'`.
   *
   * Possible errors: 401 (code invalid), 404 (id unknown), 409 (already
   * verified), 410 (window expired), 500.
   */
  @summary("Submit verification code")
  @operationId("human-verify")
  @route("{id}/verify")
  @post verify(@path id: humanId, @body body: HumanVerifyRequest):
    | HumanVerifyResponse
    | UnauthorizedError
    | NotFoundError
    | ConflictError
    | GoneError
    | InternalError;

  /**
   * Request a fresh verification code. Rate-limited by an arithmetic
   * backoff schedule (1 → 2 → 3 → … → 60 minutes between sends). The
   * absolute 30-min expiry is *not* extended; it stays anchored to
   * the original `expires_at`.
   *
   * Possible errors: 404, 409, 410, 429 (with `Retry-After`), 500.
   */
  @summary("Re-issue verification code")
  @operationId("human-verify-resend")
  @route("{id}/verify/resend")
  @post resend(@path id: humanId):
    | HumanResendResponse
    | NotFoundError
    | ConflictError
    | GoneError
    | RateLimitedError
    | InternalError;
}
