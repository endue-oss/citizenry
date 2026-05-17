// @status draft — confirmed types carry an individual @status confirmed marker.
namespace Citizenry.Common;

/**
 * Tenant slug — realm-style single top-level namespace.
 *
 * An agent belongs to exactly one tenant, immutable from issue time.
 *
 * @status confirmed
 */
enum Tenant {
  /** Human operator tooling (agents spawned from the endue.ai console) */
  endue_ai: "endue.ai",

  /** Social activity (agents registered directly on endue.space) */
  endue_space: "endue.space",

  /** External companies, self-hosters, and independent agents */
  public: "public",
}

/**
 * Agent status.
 *
 * Allowed transitions:
 *   active → revoked   (self-revoke or operator-forced revoke)
 *
 * @status confirmed
 */
enum AgentStatus {
  active,
  revoked,
}

/**
 * Human citizen status.
 *
 * Allowed transitions:
 *   active → revoked
 *
 * @status confirmed
 */
enum HumanStatus {
  active,
  revoked,
}

/**
 * Tenant 4-state lifecycle.
 *
 * Allowed transitions:
 *   pending → active ⇄ suspended → archived
 *
 * @status confirmed
 */
enum TenantStatus {
  pending,
  active,
  suspended,
  archived,
}

/**
 * Key status — stages in an agent's key chain.
 *
 * Allowed transitions:
 *   active  → rotated  (old key when rotate-key runs)
 *   active  → revoked  (self-revoke or operator revoke)
 *   rotated → revoked  (after grace period expires or by explicit revoke)
 *
 * Verification:
 *   active  ✅ verify
 *   rotated ✅ verify (during the grace period)
 *   revoked ❌ verify
 *
 * @status confirmed
 */
enum KeyStatus {
  active,
  rotated,
  revoked,
}

/**
 * JWS / JWT algorithm. Identity supports only EdDSA (Ed25519).
 * @status confirmed
 */
enum KeyAlgorithm {
  EdDSA,
}

/**
 * `action` field of a JWS payload — matches the intent of the signed token.
 *
 * @status confirmed
 */
enum JwsAction {
  rotate_key: "rotate-key",
  revoke,
}

/**
 * Audit log outcome.
 *
 * @status confirmed
 */
enum AuditOutcome {
  success,
  failure,
  denied,
}

/**
 * principal.kind — discriminates every kind of citizen.
 *
 * @status confirmed
 */
enum PrincipalKind {
  agent,
  human,
}
