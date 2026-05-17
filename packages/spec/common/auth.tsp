import "@typespec/http";

using TypeSpec.Http;

// @status confirmed
namespace Citizenry.Common;

/**
 * Service PSK — admin / 운영자 호출. `X-Service-Key` 헤더.
 *
 * constant-time 비교, 32+ bytes 권장.
 *
 * @status confirmed
 */
model ServiceKeyAuth is ApiKeyAuth<ApiKeyLocation.header, "X-Service-Key">;

/**
 * Enrollment Bearer token — 부트스트랩 1회성 자가등록.
 *
 * `Authorization: Bearer eret_…`. peppered SHA-256 으로 검증.
 *
 * @status confirmed
 */
model EnrollmentBearerAuth is BearerAuth;

/**
 * Self-signed JWT Bearer — 등록 완료된 에이전트의 self-service 인증.
 *
 * `Authorization: Bearer eyJ…`. Ed25519 서명, `iss = sub` (self-signed).
 *
 * @status confirmed
 */
model AgentJwtAuth is BearerAuth;
