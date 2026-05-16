import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /me — 등록된 에이전트의 self-service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 자기 정보 응답 (`GET /api/v1/agent/me`).
 * @status confirmed
 */
model AgentMeGetResponse {
  id: agentId;
  slug: slug;
  display_name?: string;

  /** 활성 Ed25519 공개키 (raw 32 bytes, base64url) */
  public_key_b64: base64url;

  status: AgentStatus;
  tenant: Tenant;

  did: did;

  owner_human_principal_id: humanId;

  metadata?: Record<unknown>;

  created_at: iso8601;
  updated_at: iso8601;
}

// ── Rotate-key (JWS body) ──────────────────────────────────

/**
 * `rotate-key` JWS payload 의 inner `payload` 필드.
 *
 * @status confirmed
 */
model RotateKeyJwsInner {
  /** 새 Ed25519 공개키 JWK. `kid` 는 서버가 신규 발급 (제출 시 포함 안 함). */
  new_public_key_jwk: JwkOkpEd25519Submission;
}

/**
 * `rotate-key` body JWS 의 decoded payload (RFC 7515 §4.1 의 두 번째 segment).
 *
 * Header: `JwsProtectedHeader` (alg=EdDSA, kid=현 active 키)
 * Signature: 현 active 키 (Ed25519) 로 서명
 *
 * @status confirmed
 */
model RotateKeyJwsPayload extends JwsPayloadBase {
  /** Action discriminator — `rotate-key` */
  action: "rotate-key";

  /** Rotate 대상 데이터 */
  payload: RotateKeyJwsInner;
}

/**
 * Rotate-key 요청 — 본문에 compact JWS 자체를 담는다.
 *
 * 검증:
 * 1. JWS 서명을 **구 키** (현재 active) 로 검증.
 * 2. `jti` 1회성 강제.
 * 3. `action == "rotate-key"`.
 * 4. payload 의 새 JWK 가 Ed25519 / EdDSA.
 * 5. 새 kid 발급, 구 kid → `rotated` 상태 (grace period 동안 verify 가능).
 *
 * @status confirmed
 */
model RotateKeyCreateRequest {
  /** Compact JWS — `header.payload.signature`. inner payload 는 `RotateKeyJwsPayload`. */
  jws: string;
}

/**
 * Rotate-key 응답.
 * @status confirmed
 */
model RotateKeyCreateResponse {
  /** 직전 활성 키. 이제 `rotated` 상태. */
  prev_kid: kid;

  /** 신규 활성 키. */
  new_kid: kid;

  /** 구 키가 verify 가능한 만료 시각 (grace period 끝). */
  rotated_until: iso8601;
}

// ── Self-revoke (JWS body) ─────────────────────────────────

/**
 * `revoke` JWS payload 의 inner `payload` 필드. 의도 매칭 외 추가 데이터 없음.
 *
 * @status confirmed
 */
model SelfRevokeJwsInner {}

/**
 * Self-revoke body JWS 의 decoded payload.
 *
 * Header: `JwsProtectedHeader` (alg=EdDSA, kid=현 active 키)
 * Signature: 현 active 키 (Ed25519) 로 서명
 *
 * @status confirmed
 */
model SelfRevokeJwsPayload extends JwsPayloadBase {
  /** Action discriminator — `revoke` */
  action: "revoke";

  /** 빈 payload */
  payload: SelfRevokeJwsInner;
}

/**
 * Self-revoke 요청 — 본문에 compact JWS.
 *
 * 효과: agent + 모든 keys → `revoked`. 즉시 발효.
 *
 * @status confirmed
 */
model SelfRevokeRequest {
  /** Compact JWS — inner payload 는 `SelfRevokeJwsPayload`. */
  jws: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /me Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 등록된 에이전트의 self-service.
 *
 * 인증:
 * - GET            : Bearer self-signed JWT (RFC 7523 private_key_jwt)
 * - POST rotate-key: body 내 JWS (구 키 서명) — Authorization 헤더 무관
 * - DELETE         : body 내 JWS (현 키 서명) — 동일
 *
 * @status confirmed
 */
@tag("Self-service")
@route("/api/v1/agent/me")
interface Me {
  /**
   * 자기 정보 조회. `Authorization: Bearer <self-signed JWT>` 필요.
   *
   * 가능한 에러: 401, 404, 429, 500
   */
  @get whoami(
    @header("Authorization") authorization: bearerJwt,
  ): AgentMeGetResponse | UnauthorizedError | NotFoundError | RateLimitedError | InternalError;

  /**
   * 키 회전. body 내 JWS 가 구 키로 서명되어 있어야 함.
   *
   * 가능한 에러: 400, 401, 404, 422, 429, 500
   */
  @route("rotate-key")
  @post rotateKey(
    @body body: RotateKeyCreateRequest,
  ): RotateKeyCreateResponse | BadRequestError | UnauthorizedError | NotFoundError | UnprocessableError | RateLimitedError | InternalError;

  /**
   * 자가 폐기. body 내 JWS 가 현 active 키로 서명.
   * 발효 후 모든 키 → `revoked`.
   *
   * 가능한 에러: 400, 401, 404, 429, 500
   */
  @delete revoke(
    @body body: SelfRevokeRequest,
  ): {
    @statusCode statusCode: 204;
  } | BadRequestError | UnauthorizedError | NotFoundError | RateLimitedError | InternalError;
}
