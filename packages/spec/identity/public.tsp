import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public — unauthenticated, cacheable (static + CDN).
// Absorbing 99% of traffic is core to the availability SLA.
// Recommended header: `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Issuer JWK Set — every active and rotated key of this citizenry-id instance.
 *
 * @status confirmed
 */
@tag("Public")
@route("/.well-known/jwks.json")
@useAuth(NoAuth)
interface IssuerJwks {
  /** Possible errors: 500, 503. */
  @summary("Issuer JWK Set (all active and rotated keys)")
  @operationId("public-issuer-jwks")
  @get read(): JwkSet | InternalError | ServiceUnavailableError;
}

/**
 * Issuer DID Document — `did:web:citizenry.id`.
 * @status confirmed
 */
@tag("Public")
@route("/.well-known/did.json")
@useAuth(NoAuth)
interface IssuerDid {
  /** Possible errors: 500, 503. */
  @summary("Issuer DID Document (did:web)")
  @operationId("public-issuer-did")
  @get read(): DidDocument | InternalError | ServiceUnavailableError;
}

/**
 * Per-agent JWK Set — active and rotated keys of a single agent.
 *
 * Useful when an RP wants to verify only a specific agent (narrower than the issuer JWKS).
 *
 * @status confirmed
 */
@tag("Public")
@route("/agent/{id}/jwks.json")
@useAuth(NoAuth)
interface AgentJwks {
  /** Possible errors: 404 (agent_not_found), 500. */
  @summary("Per-agent JWK Set")
  @operationId("public-agent-jwks")
  @get read(@path id: agentId): JwkSet | NotFoundError | InternalError;
}

/**
 * Per-agent DID Document — `did:web:citizenry.id:agent:{id}`.
 *
 * `verificationMethod` contains only the active key.
 *
 * @status confirmed
 */
@tag("Public")
@route("/agent/{id}/did.json")
@useAuth(NoAuth)
interface AgentDid {
  /** Possible errors: 404 (agent_not_found / no active key), 500. */
  @summary("Per-agent DID Document")
  @operationId("public-agent-did")
  @get read(@path id: agentId): DidDocument | NotFoundError | InternalError;
}
