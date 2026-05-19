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
//   2. POST /v1/humans/:id/verify       — submit 6-digit code; first API-Key is issued + emailed
//   3. POST /v1/humans/:id/verify/resend — re-request code (rate-limited)
//   4. GET  /v1/humans?email=…          — public lookup by email
//   5. POST /v1/humans/:id/api-key/issue   — Bearer chk_ → mint additional API-Key, delivered via email
//   6. POST /v1/humans/:id/api-key/revoke  — Bearer chk_ → revoke an API-Key
//
// /humans + /verify + /verify/resend + GET are unauthenticated — the
// email round-trip is the credential. /api-key/* require an existing
// Bearer chk_ API-Key whose owner matches the path id.
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
 * Response after successful verification — the human is now `active`,
 * and the server has issued a first API-Key (`chk_<…>`). The raw token
 * is surfaced **once** in the response body and emailed in parallel;
 * subsequent issuances require `Authorization: Bearer chk_<…>`.
 *
 * @status draft
 */
model HumanVerifyResponse {
  id: humanId;
  email: string;
  status: "active";
  verified_at: iso8601;

  /** First API-Key bundle — surfaced once. */
  api_key: ApiKeyIssued;
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

/**
 * Public lookup by email — returns the minimum needed to drive the
 * `/verify` flow from a CLI that lost the `hu_<ULID>`. The email is
 * normalised to lowercase server-side; no body, no auth.
 *
 * @status draft
 */
model HumanFindResponse {
  id: humanId;
  status: "pending_verification" | "active";
}

// ── API-Key models ──────────────────────────────────────

/**
 * Optional metadata accepted when issuing an API-Key.
 * @status draft
 */
model HumanApiKeyIssueRequest {
  /** Human-readable label (e.g. "scout-bot laptop"). */
  display_name?: string;

  /** Absolute expiry (ISO-8601). Omit for never-expires. */
  expires_at?: iso8601;
}

/**
 * Issuance envelope. The raw `token` field is surfaced once — only the
 * peppered SHA-256 lives on the server. Persist the body or rely on the
 * mailed copy.
 *
 * @status draft
 */
model ApiKeyIssued {
  api_key_id: string;
  /** `chk_<…>` — surfaced once. */
  token: string;
  display_name?: string;
  expires_at?: iso8601;
  created_at: iso8601;

  notify_outbound_log_id?: string;
  notify_status?: string;
}

/** @status draft */
model HumanApiKeyRevokeRequest {
  /** `hak_<…>` — the row id of the key to revoke. */
  api_key_id: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes
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
   * Look up a human by email. Returns `{ id, status }` only — no
   * timing info or display name — so an attacker probing for valid
   * addresses learns the minimum.
   *
   * @status draft
   */
  @summary("Look up a human by email")
  @operationId("human-find")
  @get find(@query email: string):
    | HumanFindResponse
    | BadRequestError
    | NotFoundError
    | InternalError;

  /**
   * Submit the verification code. On success flips
   * `human.status='active'` AND issues a first API-Key, returning the
   * raw `chk_<…>` token exactly once in the response (and emailing it
   * in parallel).
   *
   * Possible errors: 401 (code invalid), 404 (id unknown), 409 (already
   * verified), 410 (window expired), 500.
   */
  @summary("Submit verification code and receive the first API-Key")
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

@tag("Humans / API-Key")
@route("/v1/humans/{id}/api-key")
@useAuth(ApiKeyBearerAuth)
interface HumansApiKey {
  /**
   * Mint a fresh API-Key for `{id}`. The caller must present a Bearer
   * `chk_<…>` whose owner matches the path id; cross-issuance is 403.
   * The raw token is surfaced once in the response and emailed in
   * parallel.
   *
   * Possible errors: 401 (api-key invalid / revoked / expired), 403
   * (owner mismatch), 404, 500.
   *
   * @status draft
   */
  @summary("Issue a new API-Key for the human")
  @operationId("human-api-key-issue")
  @route("issue")
  @post issue(@path id: humanId, @body body: HumanApiKeyIssueRequest):
    | {
        @statusCode statusCode: 201;
        @body body: ApiKeyIssued;
      }
    | UnauthorizedError
    | ForbiddenError
    | NotFoundError
    | InternalError;

  /**
   * Revoke an API-Key by its row id. Idempotent — revoking an already
   * revoked key returns 204. The bearer must be an active key of the
   * same human; you can revoke any of your own keys (including the one
   * you authenticated with).
   *
   * Possible errors: 401, 403, 404, 500.
   *
   * @status draft
   */
  @summary("Revoke an API-Key")
  @operationId("human-api-key-revoke")
  @route("revoke")
  @post revoke(@path id: humanId, @body body: HumanApiKeyRevokeRequest):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | ForbiddenError
    | NotFoundError
    | InternalError;
}
