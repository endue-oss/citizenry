import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Register Models — 에이전트 자가 등록 (RFC 7591 호환)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 에이전트 자가 등록 요청.
 *
 * 헤더 `Authorization: Bearer eret_…` 로 enrollment token 제시.
 * 본문에는 에이전트가 **로컬에서 생성한** Ed25519 공개키 JWK 만 포함.
 *
 * @status confirmed
 * @example
 * ```json
 * {
 *   "slug": "scout-007",
 *   "display_name": "Scout 007",
 *   "public_key_jwk": {
 *     "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA",
 *     "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
 *   }
 * }
 * ```
 */
model AgentRegisterRequest {
  /** 사람 친화 식별자. 인스턴스 내 unique. */
  slug: slug;

  /** 사람이 읽을 이름 (선택) */
  display_name?: string;

  /** 에이전트가 로컬에서 생성한 Ed25519 공개키 JWK (kid 없음 — 서버 발급) */
  public_key_jwk: JwkOkpEd25519Submission;

  /** 자유 메타데이터 (선택) */
  metadata?: Record<unknown>;
}

/**
 * 에이전트 자가 등록 응답.
 *
 * @status confirmed
 */
model AgentRegisterResponse {
  /** 발급된 agent_id */
  id: agentId;

  slug: slug;
  display_name?: string;

  /** `did:web:citizenry.id:agent:{id}` */
  did: did;

  /** 공개키 식별자 (JWS / JWT header `kid`) */
  kid: kid;

  /** 상속된 tenant (enrollment 가 결정) */
  tenant: Tenant;

  /** 책임 chain 종착점 — owner human */
  owner_human_principal_id: humanId;

  metadata?: Record<unknown>;

  created_at: iso8601;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Register Route (Bearer enrollment token)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 에이전트 자가 등록.
 *
 * 검증:
 * 1. `Authorization: Bearer eret_…` 토큰 prefix.
 * 2. peppered SHA-256 비교 + 사용 횟수 차감 (atomic).
 * 3. tenant 상속 (enrollment 의 tenant → agent 의 tenant membership).
 * 4. slug unique 검사.
 *
 * @status confirmed
 */
@tag("Register")
@route("/api/v1/agent/register")
interface Register {
  /**
   * 가능한 에러:
   * - 400 BadRequest (malformed body)
   * - 401 Unauthorized (enrollment_token_invalid)
   * - 409 Conflict (slug duplicate)
   * - 410 Gone (enrollment 만료/소진)
   * - 422 Unprocessable (jwk_invalid / slug_invalid / tenant_invalid)
   * - 429 RateLimited
   */
  @post register(
    @header("Authorization") authorization: bearerEnrollment,
    @body body: AgentRegisterRequest,
  ): {
    @statusCode statusCode: 201;
    @body body: AgentRegisterResponse;
  } | BadRequestError | UnauthorizedError | ConflictError | GoneError | UnprocessableError | RateLimitedError | InternalError;
}
