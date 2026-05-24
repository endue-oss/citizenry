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
 * X25519 public-key JWK base (RFC 8037 §2) — Octet Key Pair on the
 * Montgomery curve, used for ECDH key-agreement (vault encrypt-to-agent).
 * Distinct from the Ed25519 signing key: an agent registers both.
 *
 * @example
 * ```json
 * { "kty": "OKP", "crv": "X25519", "use": "enc", "x": "3p7bfXt9w..." }
 * ```
 *
 * @status confirmed
 */
model JwkOkpX25519Base {
  /** Key type — Octet Key Pair */
  kty: "OKP";

  /** Curve — X25519 */
  crv: "X25519";

  /** Public-key bytes, base64url-encoded (32 bytes) */
  x: base64url;

  /** Public-key use — `"enc"` (key-agreement) */
  `use`?: "enc";
}

/**
 * Submission X25519 JWK — client → server on `register`. `kid` is
 * issued by the server, so it **must not be included**.
 * @status confirmed
 */
model JwkOkpX25519Submission extends JwkOkpX25519Base {}

/**
 * Published X25519 JWK — used in `JwkSet` / `DidDocument` exposure.
 * `kid` is required.
 * @status confirmed
 */
model JwkOkpX25519Published extends JwkOkpX25519Base {
  /** Key ID — server-issued, required when exposed externally */
  kid: kid;
}

/**
 * JWK Set (RFC 7517 §5) — externally exposed. Carries both the
 * Ed25519 signing keys (`use:"sig"`) and the X25519 encryption keys
 * (`use:"enc"`) for an agent.
 * @status confirmed
 */
model JwkSet {
  keys: (JwkOkpEd25519Published | JwkOkpX25519Published)[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Key-binding JWS — ties an X25519 enc key to the Ed25519 identity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Decoded payload of the registration key-binding JWS.
 *
 * Submitted (compact, base64url) as `key_binding_jws` on the
 * client-keyed register path. Signed by the Ed25519 signing key,
 * which both proves possession of that key and asserts that the
 * X25519 enc key belongs to the same identity.
 *
 * Validation (server-side):
 * - header `alg = "EdDSA"`
 * - `purpose = "key-binding"`
 * - `sig_jwk.x` equals the submitted `public_key_jwk.x`
 * - `enc_jwk.x` equals the submitted `encryption_key_jwk.x`
 * - `slug` equals the register request slug
 * - `exp` is in the future (short lifetime recommended)
 * - Ed25519 signature over `header.payload` verifies against `sig_jwk`
 *
 * @status confirmed
 */
model KeyBindingJwsPayload {
  /** Fixed discriminator. */
  purpose: "key-binding";

  /** The Ed25519 signing public key (self-reference). */
  sig_jwk: JwkOkpEd25519Submission;

  /** The X25519 encryption public key being bound. */
  enc_jwk: JwkOkpX25519Submission;

  /** Agent slug — must match the register request. */
  slug: slug;

  /** Issued at (epoch seconds). */
  iat: unixTimestamp;

  /** Expires at (epoch seconds). Short lifetime recommended. */
  exp: unixTimestamp;
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

  /** Ed25519 signing keys — references into `verificationMethod`. */
  authentication: string[];

  /** Ed25519 signing keys — references into `verificationMethod`. */
  assertionMethod: string[];

  /** X25519 encryption keys — references into `verificationMethod`. */
  keyAgreement: string[];
}

/**
 * Verification method (W3C jws-2020 suite). Holds either an Ed25519
 * signing key (referenced from `authentication`/`assertionMethod`) or
 * an X25519 key-agreement key (referenced from `keyAgreement`).
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
  publicKeyJwk: JwkOkpEd25519Published | JwkOkpX25519Published;
}
