import type { Db } from '../db'

export type RegisterService = ReturnType<typeof createRegisterService>

/**
 * Agent 자가 등록.
 *
 * 미구현 — service 단에서:
 *   1. Authorization 헤더에서 enrollment token 추출
 *   2. peppered SHA-256 hash, enrollment_token.consume (atomic)
 *   3. slug unique 검사
 *   4. principal + agent 생성 (ULID), tenant_principal_membership row
 *   5. agent_key (active, kid_<ULID>) insert
 *   6. audit_log insert
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
