import "./scalars.tsp";
import "./enums.tsp";

// @status draft — confirmed types carry an individual @status confirmed marker.
namespace Citizenry.Common;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOSE — JWK / JWS / JWT (RFC 7515 / 7517 / 7518 / 7519 / 8037)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Ed25519 public-key JWK base (RFC 8037 §2) — shared fields except `kid`.
 *
 * Pick one of the two specializations per context:
 * - `JwkOkpEd25519Submission` — client → server submission (no kid; the
 *   server issues it).
 * - `JwkOkpEd25519Published` — server → world exposure (kid required).
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

  /** Public-key bytes, base64url-encoded (32 bytes) */
  x: base64url;

  /** Public-key use — `"sig"` */
  `use`?: "sig";
}

/**
 * Submission Ed25519 JWK — client → server on `register` / `rotate-key`.
 * `kid` is issued by the server, so it **must not be included**.
 *
 * @status confirmed
 */
model JwkOkpEd25519Submission extends JwkOkpEd25519Base {}

/**
 * Published Ed25519 JWK — used in `JwkSet`, `DidDocument`, and any other
 * external exposure. `kid` is required.
 *
 * @status confirmed
 */
model JwkOkpEd25519Published extends JwkOkpEd25519Base {
  /** Key ID — server-issued, required when exposed externally */
  kid: kid;
}

/**
 * JWK Set (RFC 7517 §5) — externally exposed. Uses the variant where
 * `kid` is required.
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
 * Decoded form of the first segment of a compact JWS
 * (`base64url(JSON(header))`).
 *
 * @status confirmed
 */
model JwsProtectedHeader {
  /** Signing algorithm — EdDSA only */
  alg: "EdDSA";

  /** Signing key — identifier for JWKS lookup */
  kid: kid;

  /** Token type — JWT (optional, for compatibility) */
  typ?: "JWT";
}

/**
 * Common base claims for self-signed JWS payloads.
 *
 * Every body JWS (`/me/rotate-key`, `DELETE /me`) serializes a payload
 * built from these claims plus `action` and `payload`.
 *
 * Validation:
 * - `iss == sub` (self-signed)
 * - `aud ∈ {api.citizenry.id, citizenry-id}` (transitional)
 * - `exp - iat ≤ 300s` recommended
 * - `jti` enforced single-use via D1/Redis `SET NX EX 5min`
 *
 * @status confirmed
 */
model JwsPayloadBase {
  /** Subject — agent_id */
  sub: agentId;

  /** Issuer — equal to `sub` (self-signed) */
  iss: agentId;

  /** Audience — `api.citizenry.id` or `citizenry-id` (transitional) */
  aud: string | string[];

  /** Issued at (epoch seconds) */
  iat: unixTimestamp;

  /** Expires at (epoch seconds). Lifetime ≤ 300s recommended. */
  exp: unixTimestamp;

  /** JWT ID — replay protection. Required for body JWS. */
  jti: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JWT claims (RFC 7519 + citizenry-id extensions)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Self-signed agent JWT claims.
 *
 * - `aud` is an array or a single string — verifiers accept either
 *   `api.citizenry.id` or `citizenry-id` (transitional).
 * - `iss = sub` (self-signed).
 * - `kid` matches the JWS header.
 *
 * @status confirmed
 */
model AgentJwtClaims {
  /** Subject — agent_id */
  sub: agentId;

  /** Issuer — equal to `sub` (self-signed) */
  iss: agentId;

  /** Audience — citizenry-id or api.citizenry.id */
  aud: string | string[];

  /** Issued at (epoch seconds) */
  iat: unixTimestamp;

  /** Expires at (epoch seconds) */
  exp: unixTimestamp;

  /** Key ID (matches the header) */
  kid: kid;

  /** JWT ID (optional, recommended — replay protection) */
  jti?: string;

  /** Slug (optional, for convenience) */
  agent_slug?: slug;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3C DID Document (DID Core 1.0)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DID document — did:web method.
 *
 * @status confirmed
 */
model DidDocument {
  /** JSON-LD context */
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

  /** Always `JsonWebKey2020` */
  type: "JsonWebKey2020";

  /** Owner DID */
  controller: did;

  /** Public-key JWK — externally exposed, so uses the `kid`-required variant */
  publicKeyJwk: JwkOkpEd25519Published;
}
