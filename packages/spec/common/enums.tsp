// @status draft — 확정된 타입에는 개별 @status confirmed 표기
namespace Citizenry.Common;

/**
 * Tenant slug — realm 식 단일 top-level 네임스페이스.
 *
 * 한 에이전트는 정확히 하나의 tenant 에 속하며 발급 시점에 immutable.
 *
 * @status confirmed
 */
enum Tenant {
  /** 사람의 운영 도구 (endue.ai 콘솔에서 spawn 된 에이전트) */
  endue_ai: "endue.ai",

  /** 사회 활동 (endue.space 에서 직접 등록) */
  endue_space: "endue.space",

  /** 외부 회사 / 셀프호스트 / 독립 에이전트 */
  public: "public",
}

/**
 * 에이전트 상태.
 *
 * 허용 전이:
 *   active → revoked   (자가 폐기 또는 운영자 강제 폐기)
 *
 * @status confirmed
 */
enum AgentStatus {
  active,
  revoked,
}

/**
 * Human 시민 상태.
 *
 * 허용 전이:
 *   active → revoked
 *
 * @status confirmed
 */
enum HumanStatus {
  active,
  revoked,
}

/**
 * Tenant 4-state lifecycle.
 *
 * 허용 전이:
 *   pending → active ⇄ suspended → archived
 *
 * @status confirmed
 */
enum TenantStatus {
  pending,
  active,
  suspended,
  archived,
}

/**
 * 키 상태 — 에이전트 키 chain 의 단계.
 *
 * 허용 전이:
 *   active  → rotated  (rotate-key 시 구 키)
 *   active  → revoked  (자가 폐기 / 운영자 폐기)
 *   rotated → revoked  (grace period 만료 후 또는 명시적 폐기)
 *
 * 검증 시:
 *   active  ✅ verify
 *   rotated ✅ verify (grace period 동안)
 *   revoked ❌ verify
 *
 * @status confirmed
 */
enum KeyStatus {
  active,
  rotated,
  revoked,
}

/**
 * JWS / JWT 알고리즘. Identity 는 EdDSA (Ed25519) 만 지원.
 * @status confirmed
 */
enum KeyAlgorithm {
  EdDSA,
}

/**
 * JWS payload 의 `action` 필드 — 동일 서명 토큰의 의도 매칭.
 *
 * @status confirmed
 */
enum JwsAction {
  rotate_key: "rotate-key",
  revoke,
}

/**
 * Audit log outcome.
 *
 * @status confirmed
 */
enum AuditOutcome {
  success,
  failure,
  denied,
}

/**
 * principal.kind — 모든 시민의 종류 식별.
 *
 * @status confirmed
 */
enum PrincipalKind {
  agent,
  human,
}
