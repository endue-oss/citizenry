import type { Db } from '../db'

export type RegisterService = ReturnType<typeof createRegisterService>

/**
 * Agent self-registration.
 *
 * Not implemented — at the service layer:
 *   1. Extract enrollment token from the Authorization header
 *   2. peppered SHA-256 hash, enrollment_token.consume (atomic)
 *   3. slug uniqueness check
 *   4. Create principal + agent (ULID), tenant_principal_membership row
 *   5. Insert agent_key (active, kid_<ULID>)
 *   6. Insert audit_log
 */
export const createRegisterService = (_deps: {
  db: Db
  pepper: Uint8Array
  issuerHost: string
}) => ({
  register: async (_input: {
    rawToken: string
    slug: string
    displayName?: string
    publicKeyJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string }
    metadata?: Record<string, unknown>
  }) => {
    throw new Error('not implemented')
  },
})
