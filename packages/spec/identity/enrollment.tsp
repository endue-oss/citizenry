import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enrollment Models — 운영자가 발행하는 1회성 부트스트랩 토큰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Enrollment 발급 요청.
 *
 * 발행된 token (`eret_…`) 은 응답에서 한 번만 노출되며,
 * peppered SHA-256 으로 저장되어 비교만 가능하다.
 *
 * @status confirmed
 */
model EnrollmentCreateRequest {
  /** 발급 owner — `hu_<ULID>` */
  owner_human_principal_id: humanId;

  /** 부여할 tenant — 발급 시점에 immutable. 미지정 시 `public`. */
  tenant?: Tenant = Tenant.public;

  /**
   * 사용 가능 횟수 (1 이상). 1 이 일반적이지만 동시 다수 부트스트랩에 ↑ 가능.
   */
  @minValue(1)
  @maxValue(100)
  uses: int32;

  /**
   * 만료까지 초. 권장 60~86400.
   */
  @minValue(60)
  @maxValue(86400)
  ttl_secs: int32;

  /**
   * Option B (server keygen) 허용 여부. 기본 false.
   * true 면 register 시 server 가 keypair 생성해 private key 를 반환할 수 있음.
   */
  allow_keygen?: boolean = false;

  /**
   * 자유 메타데이터 (운영 추적용).
   */
  metadata?: Record<unknown>;
}

/**
 * Enrollment 발급 응답.
 *
 * `token` 은 응답에서 한 번만 노출된다. 서버는 peppered SHA-256 만 보유.
 *
 * @status confirmed
 */
model EnrollmentCreateResponse {
  id: enrollmentId;

  /** raw enrollment token — `eret_…`. 응답 1회 노출. */
  token: enrollmentToken;

  /** 발급된 tenant (요청에서 지정 또는 기본값) */
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
 * Enrollment 목록 row (admin read).
 *
 * `token` 은 노출하지 않는다 (해시만 보유).
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
 * 운영자 / admin BFF 가 호출. 모든 요청에 `X-Service-Key` 헤더 필요.
 *
 * @status confirmed
 */
@tag("Enrollment")
@route("/api/v1/enrollments")
interface Enrollments {
  /**
   * 신규 enrollment 발급.
   * 응답에서 `token` 이 노출된 직후, 호출자(운영자)가 에이전트에 out-of-band 전달.
   *
   * 가능한 에러: 400 (BadRequest), 401 (PSK invalid), 429 (RateLimited), 500
   */
  @post create(
    @header("X-Service-Key") serviceKey: serviceKey,
    @body body: EnrollmentCreateRequest,
  ): {
    @statusCode statusCode: 201;
    @body body: EnrollmentCreateResponse;
  } | BadRequestError | UnauthorizedError | RateLimitedError | InternalError;

  /**
   * Enrollment 폐기 — 미사용 토큰 무효화. 멱등.
   *
   * 가능한 에러: 401 (PSK invalid), 404 (NotFound), 500
   */
  @delete revoke(
    @header("X-Service-Key") serviceKey: serviceKey,
    @path id: enrollmentId,
  ): {
    @statusCode statusCode: 204;
  } | UnauthorizedError | NotFoundError | InternalError;
}
