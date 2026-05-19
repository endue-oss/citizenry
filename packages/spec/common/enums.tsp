// @status draft — confirmed types carry an individual @status confirmed marker.
namespace Citizenry.Common;

// NOTE: the old `Tenant` enum (endue.ai / endue.space / public) is
// removed. Tenants are now `tenant` rows identified by their `slug`.
// The three values above remain *well-known seed slugs* — see the
// `tenant` seed migration in packages/identity/migrations.
//
// Doctrine on tenant membership:
//   The schema permits N:M membership via tenant_principal_membership.
//   Product policy currently issues an agent into exactly one tenant
//   at registration time; that policy is enforced by the api router,
//   not by a schema constraint. RFC-0002 (realm-layer-above-tenant)
//   defines how the membership graph evolves once realms exist.

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
