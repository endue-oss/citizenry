import "./scalars.tsp";
import "./enums.tsp";

// @status draft — 확정된 타입에는 개별 @status confirmed 표기
namespace Citizenry.Common;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOSE — JWK / JWS / JWT (RFC 7515 / 7517 / 7518 / 7519 / 8037)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Ed25519 공개키 JWK base (RFC 8037 §2) — `kid` 외 공통 필드.
 *
 * 사용 컨텍스트별로 다음 두 specialization 중 하나를 사용:
 * - `JwkOkpEd25519Submission` — client → server 제출 (kid 없음, 서버가 발급)
 * - `JwkOkpEd25519Published` — server → world 노출 (kid 필수)
 *
 * @example
 * ```json
 * { "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "x": "11qYAYKxC..." }
 * ```
 *
 * @status confirmed
 */
model JwkOkpEd25519Base {
  /** Key type — Octet Key Pair */
  kty: "OKP";

  /** Curve — Ed25519 */
  crv: "Ed25519";

  /** Algorithm — EdDSA (RFC 8037) */
  alg?: "EdDSA";

  /** Public key bytes, base64url 인코딩 (32 bytes) */
  x: base64url;

  /** Public key use — `"sig"` */
  `use`?: "sig";
}

/**
 * 제출용 Ed25519 JWK — `register` / `rotate-key` 시 client → server.
 * `kid` 는 서버가 발급하므로 **포함하지 않는다**.
 *
 * @status confirmed
 */
model JwkOkpEd25519Submission extends JwkOkpEd25519Base {}

/**
 * 노출용 Ed25519 JWK — `JwkSet` / `DidDocument` / 외부 노출 시.
 * `kid` 필수.
 *
 * @status confirmed
 */
model JwkOkpEd25519Published extends JwkOkpEd25519Base {
  /** Key ID — 서버 발급, 외부 노출 시 필수 */
  kid: kid;
}

/**
 * JWK Set (RFC 7517 §5) — 외부 노출용. `kid` 필수 변형 사용.
 * @status confirmed
 */
model JwkSet {
  keys: JwkOkpEd25519Published[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JWS — Protected Header + Payload (body JWS — rotate-key / revoke)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * JWS Protected Header (RFC 7515 §4.1).
 *
 * Compact JWS 의 첫 segment (`base64url(JSON(header))`) 의 decoded 형태.
 *
 * @status confirmed
 */
model JwsProtectedHeader {
  /** 서명 알고리즘 — EdDSA 만 */
  alg: "EdDSA";

  /** 서명 키 — JWKS lookup 의 식별자 */
  kid: kid;

  /** 토큰 타입 — JWT (선택, 호환성) */
  typ?: "JWT";
}

/**
 * 자가 서명 JWS payload 의 공통 base claims.
 *
 * 모든 body JWS (`/me/rotate-key`, `DELETE /me`) 의 payload 는
 * 이 claims + `action` + `payload` 로 직렬화된다.
 *
 * 검증:
 * - `iss == sub` (self-signed)
 * - `aud ∈ {api.citizenry.id, citizenry-id}` (transitional)
 * - `exp - iat ≤ 300s` 권장
 * - `jti` 는 D1/Redis SET NX EX 5min 으로 1회성 강제
 *
 * @status confirmed
 */
model JwsPayloadBase {
  /** Subject — agent_id */
  sub: agentId;

  /** Issuer — `sub` 와 동일 (self-signed) */
  iss: agentId;

  /** Audience — `api.citizenry.id` 또는 `citizenry-id` (transitional) */
  aud: string | string[];

  /** Issued at (epoch seconds) */
  iat: unixTimestamp;

  /** Expires at (epoch seconds). lifetime ≤ 300s 권장 */
  exp: unixTimestamp;

  /** JWT ID — replay 방지. body JWS 에서는 필수. */
  jti: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JWT 클레임 (RFC 7519 + citizenry-id 확장)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 에이전트 자가 서명 JWT 클레임.
 *
 * - `aud` 는 배열 또는 단일 — 검증자가 `api.citizenry.id` 또는 `citizenry-id` 수락 (transitional).
 * - `iss = sub` (self-signed).
 * - `kid` 는 header 와 동일.
 *
 * @status confirmed
 */
model AgentJwtClaims {
  /** Subject — agent_id */
  sub: agentId;

  /** Issuer — `sub` 와 동일 (self-signed) */
  iss: agentId;

  /** Audience — citizenry-id 또는 api.citizenry.id */
  aud: string | string[];

  /** Issued at (epoch seconds) */
  iat: unixTimestamp;

  /** Expires at (epoch seconds) */
  exp: unixTimestamp;

  /** Key ID (header 와 매칭) */
  kid: kid;

  /** JWT ID (선택, 권장 — replay 방지) */
  jti?: string;

  /** 슬러그 (선택, 편의용) */
  agent_slug?: slug;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3C DID Document (DID Core 1.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DID 문서 — did:web 메서드.
 *
 * @status confirmed
 */
model DidDocument {
  /** JSON-LD 컨텍스트 */
  `@context`: string[];

  /** DID URI */
  id: did;

  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod: string[];
}

/**
 * Verification method (W3C jws-2020 suite).
 * @status confirmed
 */
model VerificationMethod {
  /** `{did}#{kid}` */
  id: string;

  /** 항상 `JsonWebKey2020` */
  type: "JsonWebKey2020";

  /** 소유자 DID */
  controller: did;

  /** 공개키 JWK — 외부 노출이라 `kid` 필수 변형 사용 */
  publicKeyJwk: JwkOkpEd25519Published;
}
