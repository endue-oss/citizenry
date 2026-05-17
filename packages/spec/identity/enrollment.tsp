import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enrollment Models — operator-issued one-shot bootstrap tokens
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Enrollment issue request.
 *
 * The issued token (`eret_…`) is surfaced only once in the response;
 * the server stores a peppered SHA-256 and can only compare against it.
 *
 * @status confirmed
 */
model EnrollmentCreateRequest {
  /** Issuing owner — `hu_<ULID>` */
  owner_human_principal_id: humanId;

  /** Tenant to grant — immutable from issue time. Defaults to `public`. */
  tenant?: Tenant = Tenant.public;

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
  tenant: Tenant;

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
  tenant: Tenant;
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
// Enrollment Routes (admin — `X-Service-Key`)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Called by an operator or admin BFF. Every request requires the `X-Service-Key` header.
 *
 * @status confirmed
 */
@tag("Enrollment")
@route("/api/v1/enrollments")
@useAuth(ServiceKeyAuth)
interface Enrollments {
  /**
   * Issue a new enrollment.
   * Immediately after `token` is surfaced in the response, the caller (operator)
   * delivers it to the agent out of band.
   *
   * Possible errors: 400 (BadRequest), 401 (PSK invalid), 429 (RateLimited), 500.
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
   * Revoke an enrollment — invalidate an unused token. Idempotent.
   *
   * Possible errors: 401 (PSK invalid), 404 (NotFound), 500.
   */
  @summary("Revoke an outstanding enrollment (idempotent)")
  @operationId("enrollment-revoke")
  @delete revoke(@path id: enrollmentId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
    | InternalError;
}
