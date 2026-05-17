import "@typespec/http";

using TypeSpec.Http;

// @status confirmed
namespace Citizenry.Common;

/**
 * Service PSK — admin / operator calls. `X-Service-Key` header.
 *
 * Constant-time comparison; 32+ bytes recommended.
 *
 * @status confirmed
 */
model ServiceKeyAuth is ApiKeyAuth<ApiKeyLocation.header, "X-Service-Key">;

/**
 * Enrollment Bearer token — one-shot bootstrap self-registration.
 *
 * `Authorization: Bearer eret_…`. Verified against the peppered SHA-256.
 *
 * @status confirmed
 */
model EnrollmentBearerAuth is BearerAuth;

/**
 * Self-signed JWT Bearer — self-service auth for a registered agent.
 *
 * `Authorization: Bearer eyJ…`. Ed25519-signed, `iss = sub` (self-signed).
 *
 * @status confirmed
 */
model AgentJwtAuth is BearerAuth;
