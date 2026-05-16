import "@typespec/http";
import "./scalars.tsp";

using TypeSpec.Http;

// @status draft — 확정된 타입에는 개별 @status confirmed 표기
namespace Citizenry.Common;

/**
 * 표준 RESTful API 에러 응답 base.
 *
 * 에러 코드 포맷: `ERR-{P##}-{S##}-{NNNN}`
 * - `P##` 제품 코드 (Product)
 *   - **P01** = citizenry-id, P02 = endue-ai, P03 = endue-space
 * - `S##` 제품 내 서비스 코드 (Service)
 *   - citizenry-id 의 경우: **S01** = identity, S02 = mail, S03 = vault, S04 = wallet, S05 = tenant
 * - `NNNN` 4자리 일련번호 (서비스 내 unique).
 *   - 0xxx=transport, 1xxx=auth, 2xxx=schema, 3xxx=business, 4xxx=external dep, 5xxx=invariant, 7xxx=domain, 9xxx=fallback
 *
 * 예: `ERR-P01-S01-0401` = citizenry-id (P01) 의 identity (S01) 401 인증 실패
 *
 * @status confirmed
 */
@error
model BaseError {
  /** 에러 제목 (예: "Unauthorized", "EnrollmentExhausted") */
  title: string;

  /** 사람이 읽을 수 있는 메시지 */
  message: string;

  /** 추가 정보 (예: `{ "field": "slug", "reason": "duplicate" }`) */
  detail?: Record<unknown>;

  /** 에러 코드 — `ERR-{P##}-{S##}-{NNNN}` */
  code: string;

  /** HTTP 메서드 (예: "POST") */
  method: string;

  /** 요청 경로 (예: "/api/v1/agent/register") */
  instance: string;

  /** 전체 요청 URL */
  request_url: string;

  /** 발생 시각 (ISO 8601 UTC) */
  timestamp: iso8601;
}

/**
 * 400 Bad Request — 요청 본문/쿼리 파싱 실패, schema 위반.
 * @status confirmed
 */
@error
model BadRequestError extends BaseError {
  @statusCode statusCode: 400;
}

/**
 * 401 Unauthorized — 인증 정보 누락, JWT/JWS/PSK 검증 실패, replay.
 * @status confirmed
 */
@error
model UnauthorizedError extends BaseError {
  @statusCode statusCode: 401;
}

/**
 * 403 Forbidden — 인증은 됐으나 권한 부족.
 * @status confirmed
 */
@error
model ForbiddenError extends BaseError {
  @statusCode statusCode: 403;
}

/**
 * 404 Not Found — 리소스 없음.
 * @status confirmed
 */
@error
model NotFoundError extends BaseError {
  @statusCode statusCode: 404;
}

/**
 * 409 Conflict — slug 중복 등 unique 위반.
 * @status confirmed
 */
@error
model ConflictError extends BaseError {
  @statusCode statusCode: 409;
}

/**
 * 410 Gone — enrollment 토큰 만료/소진.
 * @status confirmed
 */
@error
model GoneError extends BaseError {
  @statusCode statusCode: 410;
}

/**
 * 422 Unprocessable Entity — schema 통과했으나 도메인 규칙 위반.
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
 * 503 Service Unavailable — backend down, healthcheck 실패.
 * @status confirmed
 */
@error
model ServiceUnavailableError extends BaseError {
  @statusCode statusCode: 503;
}

/**
 * 모든 에러 응답의 union — 라우트별 narrowing 이 어려운 경우 fallback.
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
  | ServiceUnavailableError;

/**
 * 페이지네이션 메타.
 * @status confirmed
 */
model PaginationMeta {
  total: int64;
  page: int32;
  limit: int32;
  has_next_page: boolean;
}

/**
 * 페이지네이션 응답 wrapper.
 * @status confirmed
 */
model PaginatedList<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * 공통 페이지네이션 query 파라미터.
 * @status confirmed
 */
model PaginationParams {
  @query page?: int32 = 1;

  @query
  @minValue(1)
  @maxValue(200)
  limit?: int32 = 50;
}
