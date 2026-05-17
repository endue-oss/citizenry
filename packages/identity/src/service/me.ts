import type { Db } from '../db'

export type MeService = ReturnType<typeof createMeService>

/**
 * /me self-service — whoami, rotate-key, self-revoke.
 *
 * Not implemented — at the service layer:
 *   - whoami: verify bearer JWT (header.kid → JWKS lookup) → return agent row
 *   - rotateKey: verify body JWS (signed by old key), jti claim, insert new key, mark old key rotated
 *   - revoke: verify body JWS (signed by current key), jti claim, mark agent + all keys revoked
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
