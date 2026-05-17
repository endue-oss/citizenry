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
 * Instance-level JWK Set — the deployment's own federation-signing keys.
 *
 * Per ADR-2026-0003 this endpoint **does not** contain per-agent keys. It carries the
 * small, bounded set of keys this citizenry-id instance uses to sign federation
 * peer-to-peer handshakes (RFC-0001). Verifiers of agent JWTs must resolve the JWT
 * `iss` claim to `/agent/{iss}/jwks.json` instead.
 *
 * Returns an empty set until the federation key issuance work lands.
 *
 * @status confirmed
 */
@tag("Public")
@route("/.well-known/jwks.json")
@useAuth(NoAuth)
interface IssuerJwks {
  /** Possible errors: 500, 503. */
  @summary("Instance federation JWK Set (NOT an agent aggregate — see ADR-2026-0003)")
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
 * Canonical resolution path for verifying an agent-issued JWT (ADR-2026-0003). A
 * verifier extracts `iss` from the JWT payload (which equals the agent id, since
 * citizenry enforces `iss === sub === agent_id`), fetches this endpoint at
 * `/agent/{iss}/jwks.json`, and picks the JWK whose `kid` matches the token header.
 *
 * The response contains only that agent's active and rotated keys — typically one or
 * two — so verification cost is independent of the total number of registered agents.
 *
 * @status confirmed
 */
@tag("Public")
@route("/agent/{id}/jwks.json")
@useAuth(NoAuth)
interface AgentJwks {
  /** Possible errors: 404 (agent_not_found), 500. */
  @summary("Per-agent JWK Set — canonical resolution path for agent JWTs")
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
