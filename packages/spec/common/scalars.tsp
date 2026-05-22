// @status draft — confirmed types carry an individual @status confirmed marker.
namespace Citizenry.Common;

// ── Identifier scalars (ULID with prefix) ──────────────────────────

/**
 * ULID — 26-character Crockford Base32 identifier (uppercase, excluding 0/I/L/O/U).
 * @status confirmed
 */
@pattern("^[0-9A-HJKMNP-TV-Z]{26}$")
scalar ulid extends string;

/**
 * Agent ID — `ag_` + 26-character ULID.
 * @status confirmed
 */
@pattern("^ag_[0-9A-HJKMNP-TV-Z]{26}$")
scalar agentId extends string;

/**
 * Human principal ID — `hu_` + 26-character ULID.
 * @status confirmed
 */
@pattern("^hu_[0-9A-HJKMNP-TV-Z]{26}$")
scalar humanId extends string;

/**
 * Tenant ID — `tn_` + 26-character ULID.
 * @status confirmed
 */
@pattern("^tn_[0-9A-HJKMNP-TV-Z]{26}$")
scalar tenantId extends string;

/**
 * Realm ID — `rlm_` + 26-character ULID. Identifies a hard-isolation
 * envelope (RFC-0002) that owns one or more tenants. Most operator
 * tools surface the realm slug instead; this scalar is reserved for
 * the rare case where an opaque id needs to traverse the wire.
 *
 * @status draft
 */
@pattern("^rlm_[0-9A-HJKMNP-TV-Z]{26}$")
scalar realmId extends string;

/**
 * Tenant slug — operator-visible identifier for a tenant row. Lowercase
 * letters / digits / `.` / `-`. Well-known seeded values:
 * `endue.ai`, `endue.space`, `public`.
 *
 * Used on request/response surfaces in preference to the opaque
 * `tenantId` ULID — operators reason in slugs.
 *
 * @status draft
 */
@pattern("^[a-z0-9]([a-z0-9.-]{0,61}[a-z0-9])?$")
scalar tenantSlug extends string;

/**
 * Federation peer ID — `fdp_` + 26-character ULID.
 *
 * A Citizenry instance's local row identifier for *another* instance
 * that it keeps in its own DB.
 *
 * @status confirmed
 */
@pattern("^fdp_[0-9A-HJKMNP-TV-Z]{26}$")
scalar federationPeerId extends string;

/**
 * Instance ID — `ci_` + 26-character ULID.
 *
 * A Citizenry deployment's self-id, generated once at first boot and
 * preserved thereafter. Stable across JWKS rotations, and used as the
 * peer's "name" in federation handshakes. (The DID host can change
 * without affecting instance_id.)
 *
 * @status confirmed
 */
@pattern("^ci_[0-9A-HJKMNP-TV-Z]{26}$")
scalar instanceId extends string;

/**
 * Key ID — `kid_` + 26-character ULID. Exposed in JWKS / JWS header `kid`.
 * @status confirmed
 */
@pattern("^kid_[0-9A-HJKMNP-TV-Z]{26}$")
scalar kid extends string;

/**
 * Owner ID (e.g. a user or another agent). External IdP identifiers may
 * appear, so the format is not enforced — only constrained to a string
 * up to 64 characters.
 * @status draft
 */
@maxLength(64)
scalar ownerId extends string;

/**
 * Project ID — intra-tenant grouping. Operator-defined.
 * @status draft
 */
@maxLength(64)
scalar projectId extends string;

/**
 * Slug — human-friendly agent identifier. Unique within an instance.
 *
 * - Starts with lowercase ASCII or digit, then ASCII / digits / hyphen / underscore.
 * - Length 1–64.
 * @status confirmed
 */
@pattern("^[a-z0-9][a-z0-9_-]{0,63}$")
scalar slug extends string;

/**
 * DID (Decentralized Identifier) — only `did:web:…` is allowed (W3C did-web).
 *
 * Issuer:    `did:web:citizenry.id`
 * Per-agent: `did:web:citizenry.id:agent:ag_…`
 * @status confirmed
 */
@pattern("^did:web:[A-Za-z0-9.\\-_:]+$")
scalar did extends string;

// ── Time / encoding scalars ─────────────────────────────────────

/**
 * ISO 8601 date-time UTC (e.g. "2026-04-25T14:30:00Z").
 * @status confirmed
 */
scalar iso8601 extends string;

/**
 * Unix timestamp (seconds since epoch). Used by JWT `iat` / `exp`.
 * @status confirmed
 */
scalar unixTimestamp extends int64;

/**
 * Base64url-encoded bytes (RFC 4648 §5, no padding). Used by JWK `x`, etc.
 * @status confirmed
 */
@pattern("^[A-Za-z0-9_-]+$")
scalar base64url extends string;

// ── Auth header scalars ─────────────────────────────────────────

/**
 * Service PSK header value (admin endpoints). 32+ bytes recommended.
 * Compare in constant time.
 * @status confirmed
 */
scalar serviceKey extends string;


/**
 * Bearer self-signed JWT header value — `Bearer eyJ…`.
 * @status confirmed
 */
@pattern("^Bearer\\s+[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
scalar bearerJwt extends string;
