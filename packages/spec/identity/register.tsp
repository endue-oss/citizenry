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
 * Agent registration request.
 *
 * Authenticated with the owner human's API-Key
 * (`Authorization: Bearer chk_…`); owner is derived from the key, so
 * the body carries no owner field. The caller may either submit a
 * locally generated Ed25519 public-key JWK or ask the server to
 * generate the keypair and return the private key once.
 *
 * @status draft
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
 * @example
 * ```json
 * {
 *   "slug": "scout-007",
 *   "generate_keypair": true
 * }
 * ```
 */
model AgentRegisterRequest {
  /** Human-friendly identifier. Unique within the instance. */
  slug: slug;

  /** Human-readable name (optional) */
  display_name?: string;

  /**
   * Locally generated Ed25519 public-key JWK. Exactly one of
   * `public_key_jwk` and `generate_keypair=true` must be supplied.
   */
  public_key_jwk?: JwkOkpEd25519Submission;

  /**
   * When true, the server generates a fresh Ed25519 keypair and
   * returns the private key in the response (surfaced only once).
   * @status draft
   */
  generate_keypair?: boolean = false;

  /** Tenant to grant. Defaults to `public`. */
  tenant?: Tenant = Tenant.public;

  /** Free-form metadata (optional) */
  metadata?: Record<unknown>;
}

/**
 * Agent registration response.
 *
 * @status draft
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

  /** Tenant the agent is a member of */
  tenant: Tenant;

  /** End of the responsibility chain — owner human */
  owner_human_principal_id: humanId;

  /**
   * Raw private-key JWK — present only when the request set
   * `generate_keypair=true`. Surfaced once and never recoverable.
   * @status draft
   */
  private_key_jwk?: Record<unknown>;

  metadata?: Record<unknown>;

  created_at: iso8601;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Register Route (Bearer chk_ — human API-Key)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Agent registration.
 *
 * Validation:
 * 1. `Authorization: Bearer chk_…` resolves to an active human.
 * 2. slug uniqueness.
 * 3. Either `public_key_jwk` (caller key) or `generate_keypair=true`
 *    (server keygen).
 *
 * @status draft
 */
@tag("Register")
@route("/v1/agent/register")
@useAuth(ApiKeyBearerAuth)
interface Register {
  /**
   * Possible errors:
   * - 400 BadRequest (malformed body / both jwk & generate set)
   * - 401 Unauthorized (api-key invalid)
   * - 409 Conflict (slug duplicate)
   * - 422 Unprocessable (jwk_invalid / slug_invalid / tenant_invalid)
   * - 429 RateLimited
   */
  @summary("Register a new agent under the calling human")
  @operationId("agent-register")
  @post register(@body body: AgentRegisterRequest):
    | {
        @statusCode statusCode: 201;
        @body body: AgentRegisterResponse;
      }
    | BadRequestError
    | UnauthorizedError
    | ConflictError
    | UnprocessableError
    | RateLimitedError
    | InternalError;
}
