import type { Db } from '../db'

export type MeService = ReturnType<typeof createMeService>

/**
 * /me self-service — whoami, rotate-key, self-revoke.
 *
 * 미구현 — service 단에서:
 *   - whoami: bearer JWT 검증 (header.kid → JWKS lookup) → agent row 반환
 *   - rotateKey: body JWS 검증 (구 키 서명), jti claim, 새 키 insert, 구 키 rotated
 *   - revoke: body JWS 검증 (현 키 서명), jti claim, agent + all keys → revoked
 */
export const createMeService = (_deps: { db: Db }) => ({
  whoami: async (_agentId: string) => {
    throw new Error('not implemented')
  },

  rotateKey: async (_jws: string) => {
    throw new Error('not implemented')
  },

  selfRevoke: async (_jws: string) => {
    throw new Error('not implemented')
  },
})
