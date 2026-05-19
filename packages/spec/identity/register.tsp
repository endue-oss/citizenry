import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Register Models — agent self-registration (RFC 7591 compatible)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Agent self-registration request.
 *
 * Presents the enrollment token in `Authorization: Bearer eret_…`.
 * The body carries only the Ed25519 public-key JWK that the agent
 * **generated locally**.
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
  /** Human-friendly identifier. Unique within the instance. */
  slug: slug;

  /** Human-readable name (optional) */
  display_name?: string;

  /** Ed25519 public-key JWK generated locally by the agent (no kid — server issues it) */
  public_key_jwk: JwkOkpEd25519Submission;

  /** Free-form metadata (optional) */
  metadata?: Record<unknown>;
}

/**
 * Agent self-registration response.
 *
 * @status confirmed
 */
model AgentRegisterResponse {
  /** Issued agent_id */
  id: agentId;

  slug: slug;
  display_name?: string;

  /** `did:web:citizenry.id:agent:{id}` */
  did: did;

  /** Public-key identifier (JWS / JWT header `kid`) */
  kid: kid;

  /** Inherited tenant (determined by the enrollment) */
  tenant: Tenant;

  /** End of the responsibility chain — owner human */
  owner_human_principal_id: humanId;

  metadata?: Record<unknown>;

  created_at: iso8601;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Register Route (Bearer enrollment token)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Agent self-registration.
 *
 * Validation:
 * 1. `Authorization: Bearer eret_…` token prefix.
 * 2. peppered SHA-256 comparison + use-count decrement (atomic).
 * 3. tenant inheritance (enrollment tenant → agent tenant membership).
 * 4. slug uniqueness check.
 *
 * @status confirmed
 */
@tag("Register")
@route("/v1/agent/register")
@useAuth(EnrollmentBearerAuth)
interface Register {
  /**
   * Possible errors:
   * - 400 BadRequest (malformed body)
   * - 401 Unauthorized (enrollment_token_invalid)
   * - 409 Conflict (slug duplicate)
   * - 410 Gone (enrollment expired/exhausted)
   * - 422 Unprocessable (jwk_invalid / slug_invalid / tenant_invalid)
   * - 429 RateLimited
   */
  @summary("Self-register an agent with an enrollment bearer token")
  @operationId("agent-register")
  @post register(@body body: AgentRegisterRequest):
    | {
        @statusCode statusCode: 201;
        @body body: AgentRegisterResponse;
      }
    | BadRequestError
    | UnauthorizedError
    | ConflictError
    | GoneError
    | UnprocessableError
    | RateLimitedError
    | InternalError;
}
