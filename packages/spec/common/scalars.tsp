// @status draft — 확정된 타입에는 개별 @status confirmed 표기
namespace Citizenry.Common;

// ── Identifier scalars (ULID + 접두사) ──────────────────────────

/**
 * ULID — 26자 Crockford Base32 식별자 (대문자, 0/I/L/O/U 제외)
 * @status confirmed
 */
@pattern("^[0-9A-HJKMNP-TV-Z]{26}$")
scalar ulid extends string;

/**
 * Agent ID — `ag_` + 26자 ULID
 * @status confirmed
 */
@pattern("^ag_[0-9A-HJKMNP-TV-Z]{26}$")
scalar agentId extends string;

/**
 * Human principal ID — `hu_` + 26자 ULID
 * @status confirmed
 */
@pattern("^hu_[0-9A-HJKMNP-TV-Z]{26}$")
scalar humanId extends string;

/**
 * Tenant ID — `tn_` + 26자 ULID
 * @status confirmed
 */
@pattern("^tn_[0-9A-HJKMNP-TV-Z]{26}$")
scalar tenantId extends string;

/**
 * Federation peer ID — `fdp_` + 26자 ULID.
 *
 * 한 Citizenry 인스턴스가 자신의 DB 에 보관하는 *다른* 인스턴스의 row 식별자.
 *
 * @status confirmed
 */
@pattern("^fdp_[0-9A-HJKMNP-TV-Z]{26}$")
scalar federationPeerId extends string;

/**
 * Instance ID — `ci_` + 26자 ULID.
 *
 * 한 Citizenry 배포가 부팅 시 1회 생성해 보존하는 self-id.
 * JWKS rotation 과 무관하게 안정적이며, 페더레이션 핸드셰이크에서 peer 의
 * "이름" 으로 쓰인다. (DID 의 host 부분이 바뀌어도 instance_id 는 그대로.)
 *
 * @status confirmed
 */
@pattern("^ci_[0-9A-HJKMNP-TV-Z]{26}$")
scalar instanceId extends string;

/**
 * Key ID — `kid_` + 26자 ULID. JWKS / JWS header `kid` 에 노출.
 * @status confirmed
 */
@pattern("^kid_[0-9A-HJKMNP-TV-Z]{26}$")
scalar kid extends string;

/**
 * Enrollment record ID — `enr_` + 26자 ULID. (admin 식별자, 토큰과 별개)
 * @status confirmed
 */
@pattern("^enr_[0-9A-HJKMNP-TV-Z]{26}$")
scalar enrollmentId extends string;

/**
 * Enrollment token (raw) — `eret_` + 32+ chars (Crockford Base32 + alpha).
 *
 * 부트스트랩 시 한 번만 노출되며, peppered SHA-256 으로 저장된다.
 * `Authorization: Bearer eret_…` 형태로 `/api/v1/agent/register` 호출.
 * @status confirmed
 */
@pattern("^eret_[A-Za-z0-9]{32,}$")
scalar enrollmentToken extends string;

/**
 * Owner ID (예: 사용자 / 다른 에이전트). 외부 IdP 식별자가 들어올 수 있어
 * 형식 강제는 하지 않고 64자 이내 문자열로만 제약.
 * @status draft
 */
@maxLength(64)
scalar ownerId extends string;

/**
 * Project ID — tenant 내부 그룹화. 운영자 정의.
 * @status draft
 */
@maxLength(64)
scalar projectId extends string;

/**
 * Slug — 에이전트 사람 친화 식별자. 인스턴스 내 unique.
 *
 * - 영문 소문자/숫자로 시작, 영문 소문자/숫자/하이픈/언더스코어
 * - 길이 1~64
 * @status confirmed
 */
@pattern("^[a-z0-9][a-z0-9_-]{0,63}$")
scalar slug extends string;

/**
 * DID (Decentralized Identifier) — `did:web:…` 만 허용 (W3C did-web).
 *
 * Issuer:    `did:web:citizenry.id`
 * Per-agent: `did:web:citizenry.id:agent:ag_…`
 * @status confirmed
 */
@pattern("^did:web:[A-Za-z0-9.\\-_:]+$")
scalar did extends string;

// ── Time / encoding scalars ─────────────────────────────────────

/**
 * ISO 8601 date-time UTC (e.g. "2026-04-25T14:30:00Z")
 * @status confirmed
 */
scalar iso8601 extends string;

/**
 * Unix timestamp (seconds since epoch). JWT `iat` / `exp` 에 사용.
 * @status confirmed
 */
scalar unixTimestamp extends int64;

/**
 * Base64url-encoded bytes (RFC 4648 §5, padding 없음). JWK `x` 등.
 * @status confirmed
 */
@pattern("^[A-Za-z0-9_-]+$")
scalar base64url extends string;

// ── Auth header scalars ─────────────────────────────────────────

/**
 * Service PSK 헤더 값 (admin endpoint 들). 32+ bytes 권장. constant-time 비교.
 * @status confirmed
 */
scalar serviceKey extends string;

/**
 * Bearer enrollment token header value — `Bearer eret_…`
 * @status confirmed
 */
@pattern("^Bearer\\s+eret_[A-Za-z0-9]{32,}$")
scalar bearerEnrollment extends string;

/**
 * Bearer self-signed JWT header value — `Bearer eyJ…`
 * @status confirmed
 */
@pattern("^Bearer\\s+[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
scalar bearerJwt extends string;
