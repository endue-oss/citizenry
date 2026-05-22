// ULID helpers — Crockford Base32 26-char IDs with prefixes.
// The actual ULID library (e.g. ulidx) is added when services are implemented.
// This file just centralizes the prefix convention.

export const ID_PREFIX = {
  agent: 'ag_',
  human: 'hu_',
  tenant: 'tn_',
  key: 'kid_',
  auditLog: 'alg_',
  federationPeer: 'fdp_',
  instance: 'ci_',
} as const

export type IdPrefix = keyof typeof ID_PREFIX

/**
 * Check ULID shape (does not match prefix).
 * Crockford Base32 — excludes 0/I/L/O/U, 26 chars.
 */
export const isUlid = (s: string): boolean =>
  /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)

/**
 * Check prefix match. Example: `hasPrefix('ag_01H...', 'agent')`.
 */
export const hasPrefix = (id: string, kind: IdPrefix): boolean =>
  id.startsWith(ID_PREFIX[kind])

/**
 * Agent DID builder. Caller injects the issuer host.
 * `did:web:{issuer}:agent:{id}`
 */
export const agentDid = (issuer: string, agentId: string): string =>
  `did:web:${issuer}:agent:${agentId}`

/**
 * Issuer DID builder. `did:web:{issuer}`
 */
export const issuerDid = (issuer: string): string => `did:web:${issuer}`
