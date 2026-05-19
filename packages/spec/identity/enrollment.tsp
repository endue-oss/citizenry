import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enrollment Models — human-issued bootstrap tokens
//
// Authentication switched from the operator's X-Service-Key PSK to
// the issuing human's API-Key (`Authorization: Bearer chk_…`). The
// API-Key carries owner identity, so the request body no longer takes
// `owner_human_principal_id`.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Enrollment issue request.
 *
 * The issued token (`eret_…`) is surfaced only once in the response;
 * the server stores a peppered SHA-256 and can only compare against it.
 *
 * @status draft
 */
model EnrollmentCreateRequest {
  /** Tenant slug to grant — immutable from issue time. Defaults to `public`. */
  tenant?: tenantSlug = "public";

  /**
   * Number of allowed uses (≥ 1). Usually 1; can be raised for parallel bootstraps.
   */
  @minValue(1)
  @maxValue(100)
  uses: int32;

  /**
   * Seconds until expiry. Recommended 60–86400.
   */
  @minValue(60)
  @maxValue(86400)
  ttl_secs: int32;

  /**
   * Whether Option B (server keygen) is allowed. Defaults to false.
   * When true, register may have the server generate the keypair and return the private key.
   */
  allow_keygen?: boolean = false;

  /**
   * Free-form metadata (for operator tracking).
   */
  metadata?: Record<unknown>;
}

/**
 * Enrollment issue response.
 *
 * `token` is surfaced only once. The server retains only the peppered SHA-256.
 *
 * @status confirmed
 */
model EnrollmentCreateResponse {
  id: enrollmentId;

  /** Raw enrollment token — `eret_…`. Surfaced once. */
  token: enrollmentToken;

  /** Issued tenant (from the request or the default) */
  tenant: tenantSlug;

  uses_total: int32;
  uses_left: int32;
  allow_keygen: boolean;
  expires_at: iso8601;

  owner_human_principal_id: humanId;
  metadata?: Record<unknown>;
  created_at: iso8601;
}

/**
 * Enrollment list row (admin read).
 *
 * `token` is not exposed (only the hash is retained).
 *
 * @status confirmed
 */
model EnrollmentGetResponse {
  id: enrollmentId;
  tenant: tenantSlug;
  uses_total: int32;
  uses_left: int32;
  allow_keygen: boolean;
  expires_at: iso8601;
  revoked_at?: iso8601;
  last_used_at?: iso8601;
  owner_human_principal_id: humanId;
  metadata?: Record<unknown>;
  created_at: iso8601;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enrollment Routes — Bearer chk_ (human API-Key)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Called by a verified human authenticated with their API-Key. The
 * owner of the issued enrollment is taken from the API-Key.
 *
 * @status draft
 */
@tag("Enrollment")
@route("/v1/enrollments")
@useAuth(ApiKeyBearerAuth)
interface Enrollments {
  /**
   * Issue a new enrollment.
   * Immediately after `token` is surfaced in the response, the caller
   * delivers it to the agent out of band.
   *
   * Possible errors: 400 (BadRequest), 401 (api-key invalid), 429 (RateLimited), 500.
   */
  @summary("Issue a new enrollment bearer token (one-shot bootstrap)")
  @operationId("enrollment-create")
  @post create(@body body: EnrollmentCreateRequest):
    | {
        @statusCode statusCode: 201;
        @body body: EnrollmentCreateResponse;
      }
    | BadRequestError
    | UnauthorizedError
    | RateLimitedError
    | InternalError;

  /**
   * Revoke an enrollment — invalidate an unused token. Idempotent. The
   * caller's API-Key owner must match the enrollment's owner.
   *
   * Possible errors: 401 (api-key invalid), 403 (owner mismatch), 404, 500.
   */
  @summary("Revoke an outstanding enrollment (idempotent)")
  @operationId("enrollment-revoke")
  @delete revoke(@path id: enrollmentId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | ForbiddenError
    | NotFoundError
    | InternalError;
}
