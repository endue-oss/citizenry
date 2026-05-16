import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Identity (P01-S01) 에러 코드 카탈로그
//
// 포맷: `{LEVEL}-P01-S01-{NNNN}` — LEVEL ∈ {ERR, WARN, INFO}
// 본 enum 은 ERR 코드만 (응답 body 에 노출).
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Identity (P01-S01) 의 에러 코드 카탈로그 (ERR only).
 *
 * @status confirmed
 */
enum IdentityErrorCode {
  // ── 0xxx Transport / HTTP ─────────────────────────────
  /** 400 — malformed request body / query */
  bad_request: "ERR-P01-S01-0400",
  /** 401 — 인증 누락 또는 검증 실패 (포괄) */
  unauthorized: "ERR-P01-S01-0401",
  /** 404 — 리소스 없음 (agent / enrollment / key) */
  not_found: "ERR-P01-S01-0404",
  /** 409 — slug 중복 등 conflict */
  conflict: "ERR-P01-S01-0409",
  /** 410 — enrollment 토큰 만료 / 소진 */
  gone: "ERR-P01-S01-0410",
  /** 429 — rate limited */
  rate_limited: "ERR-P01-S01-0429",
  /** 500 — 내부 오류 */
  internal: "ERR-P01-S01-0500",
  /** 503 — backend 가용 불가 */
  unavailable: "ERR-P01-S01-0503",

  // ── 1xxx Auth (JWT / JWS / PSK) ───────────────────────
  /** JWT alg ≠ EdDSA */
  jwt_alg_mismatch: "ERR-P01-S01-1001",
  /** JWT aud 불일치 (`api.citizenry.id` / `citizenry-id` 외) */
  jwt_aud_mismatch: "ERR-P01-S01-1002",
  /** JWT exp 만료 */
  jwt_expired: "ERR-P01-S01-1003",
  /** JWT kid 미존재 또는 revoked */
  jwt_kid_unknown: "ERR-P01-S01-1004",
  /** JWS replay (jti 중복) */
  jws_replay: "ERR-P01-S01-1010",
  /** JWS payload action 불일치 */
  jws_action_mismatch: "ERR-P01-S01-1011",
  /** JWS lifetime 초과 (`exp - iat > 권장 max`) */
  jws_lifetime_exceeded: "ERR-P01-S01-1012",
  /** Service PSK 검증 실패 (`X-Service-Key`) */
  psk_invalid: "ERR-P01-S01-1020",
  /** Bearer enrollment token 형식 오류 또는 검증 실패 */
  enrollment_token_invalid: "ERR-P01-S01-1030",

  // ── 2xxx Schema / 입력 검증 ──────────────────────────
  /** public_key_jwk 형식 오류 (kty/crv/길이 등) */
  jwk_invalid: "ERR-P01-S01-2001",
  /** slug pattern 위반 */
  slug_invalid: "ERR-P01-S01-2002",
  /** tenant 값 enum 외 */
  tenant_invalid: "ERR-P01-S01-2003",

  // ── 3xxx Business 규칙 ───────────────────────────────
  /** rotate-key 시 active 키가 아닌 키로 서명 시도 */
  key_not_active: "ERR-P01-S01-3001",
  /** revoked 에이전트가 self-service 호출 */
  agent_revoked: "ERR-P01-S01-3002",

  // ── 4xxx 외부 의존 ────────────────────────────────────
  /** Postgres 쿼리 실패 */
  db_failure: "ERR-P01-S01-4001",

  // ── 7xxx 도메인 특화 ─────────────────────────────────
  /** enrollment 토큰 invalid 또는 소진 */
  enrollment_invalid_or_exhausted: "ERR-P01-S01-7100",
}
