import "@typespec/http";
import "./scalars.tsp";

using TypeSpec.Http;

// @status draft — confirmed types carry an individual @status confirmed marker.
namespace Citizenry.Common;

/**
 * Standard RESTful API error response base.
 *
 * Error code format: `ERR-{P##}-{S##}-{NNNN}`
 * - `P##` product code
 *   - **P01** = citizenry-id, P02 = endue-ai, P03 = endue-space
 * - `S##` service code within the product
 *   - For citizenry-id: **S01** = identity, S02 = mail, S03 = vault, S04 = wallet, S05 = tenant
 * - `NNNN` 4-digit serial (unique within the service).
 *   - 0xxx=transport, 1xxx=auth, 2xxx=schema, 3xxx=business, 4xxx=external dep, 5xxx=invariant, 7xxx=domain, 9xxx=fallback
 *
 * Example: `ERR-P01-S01-0401` = citizenry-id (P01) identity (S01) 401 auth failure.
 *
 * @status confirmed
 */
@error
model BaseError {
  /** Error title (e.g. "Unauthorized", "EnrollmentExhausted") */
  title: string;

  /** Human-readable message */
  message: string;

  /** Extra detail (e.g. `{ "field": "slug", "reason": "duplicate" }`) */
  detail?: Record<unknown>;

  /** Error code — `ERR-{P##}-{S##}-{NNNN}` */
  code: string;

  /** HTTP method (e.g. "POST") */
  method: string;

  /** Request path (e.g. "/v1/agent/register") */
  instance: string;

  /** Full request URL */
  request_url: string;

  /** Occurrence timestamp (ISO 8601 UTC) */
  timestamp: iso8601;
}

/**
 * 400 Bad Request — body/query parsing failed or schema violation.
 * @status confirmed
 */
@error
model BadRequestError extends BaseError {
  @statusCode statusCode: 400;
}

/**
 * 401 Unauthorized — missing credentials, JWT/JWS/PSK verification failure, replay.
 * @status confirmed
 */
@error
model UnauthorizedError extends BaseError {
  @statusCode statusCode: 401;
}

/**
 * 403 Forbidden — authenticated but lacking permission.
 * @status confirmed
 */
@error
model ForbiddenError extends BaseError {
  @statusCode statusCode: 403;
}

/**
 * 404 Not Found — resource does not exist.
 * @status confirmed
 */
@error
model NotFoundError extends BaseError {
  @statusCode statusCode: 404;
}

/**
 * 409 Conflict — unique violation (e.g. duplicate slug).
 * @status confirmed
 */
@error
model ConflictError extends BaseError {
  @statusCode statusCode: 409;
}

/**
 * 410 Gone — enrollment token expired or exhausted.
 * @status confirmed
 */
@error
model GoneError extends BaseError {
  @statusCode statusCode: 410;
}

/**
 * 422 Unprocessable Entity — schema passed but domain rule violated.
 * @status confirmed
 */
@error
model UnprocessableError extends BaseError {
  @statusCode statusCode: 422;
}

/**
 * 429 Too Many Requests — rate limit.
 * @status confirmed
 */
@error
model RateLimitedError extends BaseError {
  @statusCode statusCode: 429;
}

/**
 * 500 Internal Server Error.
 * @status confirmed
 */
@error
model InternalError extends BaseError {
  @statusCode statusCode: 500;
}

/**
 * 502 Bad Gateway — upstream (federated peer, IdP, …) returned an error
 * the gateway could not satisfy.
 * @status confirmed
 */
@error
model BadGatewayError extends BaseError {
  @statusCode statusCode: 502;
}

/**
 * 503 Service Unavailable — backend down or healthcheck failed.
 * @status confirmed
 */
@error
model ServiceUnavailableError extends BaseError {
  @statusCode statusCode: 503;
}

/**
 * Union of all error responses — fallback when per-route narrowing is awkward.
 * @status confirmed
 */
alias RestfulApiErrorResponse =
  | BadRequestError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | GoneError
  | UnprocessableError
  | RateLimitedError
  | InternalError
  | BadGatewayError
  | ServiceUnavailableError;

/**
 * Pagination meta.
 * @status confirmed
 */
model PaginationMeta {
  total: int64;
  page: int32;
  limit: int32;
  has_next_page: boolean;
}

/**
 * Pagination response wrapper.
 * @status confirmed
 */
model PaginatedList<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Shared pagination query parameters.
 * @status confirmed
 */
model PaginationParams {
  @query page?: int32 = 1;

  @query
  @minValue(1)
  @maxValue(200)
  limit?: int32 = 50;
}
