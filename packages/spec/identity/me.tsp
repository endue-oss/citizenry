import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /me — self-service for a registered agent
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Self-info response (`GET /v1/agent/me`).
 * @status confirmed
 */
model AgentMeGetResponse {
  id: agentId;
  slug: slug;
  display_name?: string;

  /** Active Ed25519 public key (raw 32 bytes, base64url) */
  public_key_b64: base64url;

  status: AgentStatus;
  tenant: Tenant;

  did: did;

  owner_human_principal_id: humanId;

  metadata?: Record<unknown>;

  created_at: iso8601;
  updated_at: iso8601;
}

// ── Rotate-key (JWS body) ──────────────────────────────────

/**
 * Inner `payload` field of the `rotate-key` JWS payload.
 *
 * @status confirmed
 */
model RotateKeyJwsInner {
  /** New Ed25519 public-key JWK. The server issues `kid` (must not be included). */
  new_public_key_jwk: JwkOkpEd25519Submission;
}

/**
 * Decoded payload of the `rotate-key` body JWS (the second segment per
 * RFC 7515 §4.1).
 *
 * Header: `JwsProtectedHeader` (alg=EdDSA, kid=current active key).
 * Signature: signed with the current active key (Ed25519).
 *
 * @status confirmed
 */
model RotateKeyJwsPayload extends JwsPayloadBase {
  /** Action discriminator — `rotate-key` */
  action: "rotate-key";

  /** Rotation payload */
  payload: RotateKeyJwsInner;
}

/**
 * Rotate-key request — the body carries the compact JWS itself.
 *
 * Validation:
 * 1. Verify the JWS signature using the **old key** (currently active).
 * 2. Enforce single-use `jti`.
 * 3. `action == "rotate-key"`.
 * 4. The new JWK in the payload is Ed25519 / EdDSA.
 * 5. Issue the new kid, mark the old kid `rotated` (still usable for
 *    verify during the grace period).
 *
 * @status confirmed
 */
model RotateKeyCreateRequest {
  /** Compact JWS — `header.payload.signature`. Inner payload is `RotateKeyJwsPayload`. */
  jws: string;
}

/**
 * Rotate-key response.
 * @status confirmed
 */
model RotateKeyCreateResponse {
  /** Previously active key, now in the `rotated` state. */
  prev_kid: kid;

  /** Newly active key. */
  new_kid: kid;

  /** Deadline until which the old key is still valid for verify (end of grace period). */
  rotated_until: iso8601;
}

// ── Self-revoke (JWS body) ─────────────────────────────────

/**
 * Inner `payload` field of the `revoke` JWS payload. No extra data
 * beyond the intent match.
 *
 * @status confirmed
 */
model SelfRevokeJwsInner {}

/**
 * Decoded payload of the self-revoke body JWS.
 *
 * Header: `JwsProtectedHeader` (alg=EdDSA, kid=current active key).
 * Signature: signed with the current active key (Ed25519).
 *
 * @status confirmed
 */
model SelfRevokeJwsPayload extends JwsPayloadBase {
  /** Action discriminator — `revoke` */
  action: "revoke";

  /** Empty payload */
  payload: SelfRevokeJwsInner;
}

/**
 * Self-revoke request — the body carries a compact JWS.
 *
 * Effect: agent + all keys → `revoked`. Effective immediately.
 *
 * @status confirmed
 */
model SelfRevokeRequest {
  /** Compact JWS — inner payload is `SelfRevokeJwsPayload`. */
  jws: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /me Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Self-service for a registered agent.
 *
 * Authentication:
 * - GET             : Bearer self-signed JWT (RFC 7523 private_key_jwt).
 * - POST rotate-key : JWS in the body (signed by the old key) — Authorization header ignored.
 * - DELETE          : JWS in the body (signed by the current key) — same.
 *
 * @status confirmed
 */
@tag("Self-service")
@route("/v1/agent/me")
interface Me {
  /**
   * Read self-info. Requires `Authorization: Bearer <self-signed JWT>`.
   *
   * Possible errors: 401, 404, 429, 500.
   */
  @summary("Read the current agent's identity")
  @operationId("agent-me-whoami")
  @useAuth(AgentJwtAuth)
  @get whoami():
    | AgentMeGetResponse
    | UnauthorizedError
    | NotFoundError
    | RateLimitedError
    | InternalError;

  /**
   * Rotate keys. The body JWS must be signed with the old key.
   * Authentication comes from the body JWS, not the header, so the
   * OpenAPI security is noAuth.
   *
   * Possible errors: 400, 401, 404, 422, 429, 500.
   */
  @summary("Rotate the agent's signing key via body JWS")
  @operationId("agent-me-rotate-key")
  @useAuth(NoAuth)
  @route("rotate-key")
  @post rotateKey(@body body: RotateKeyCreateRequest):
    | RotateKeyCreateResponse
    | BadRequestError
    | UnauthorizedError
    | NotFoundError
    | UnprocessableError
    | RateLimitedError
    | InternalError;

  /**
   * Self-revoke. The body JWS must be signed with the current active
   * key. Once effective, all keys → `revoked`. No header authentication
   * (the body JWS is the credential).
   *
   * Possible errors: 400, 401, 404, 429, 500.
   */
  @summary("Self-revoke the agent via body JWS")
  @operationId("agent-me-revoke")
  @useAuth(NoAuth)
  @delete revoke(@body body: SelfRevokeRequest):
    | {
        @statusCode statusCode: 204;
      }
    | BadRequestError
    | UnauthorizedError
    | NotFoundError
    | RateLimitedError
    | InternalError;
}
