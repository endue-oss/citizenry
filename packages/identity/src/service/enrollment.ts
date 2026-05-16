import type { Db } from '../db'
import { createEnrollmentTokenRepo } from '../repo/enrollment_token'

export type EnrollmentService = ReturnType<typeof createEnrollmentService>

/**
 * Enrollment 발급 / 폐기 / 소비.
 *
 * 미구현 — service 단에서:
 *   - raw token 생성 (`eret_<32+chars>`)
 *   - peppered SHA-256 hash
 *   - DB insert
 *   - 응답에 raw token 1회만 노출
 */
export const createEnrollmentService = (deps: {
  db: Db
  pepper: Uint8Array
}) => {
  const tokens = createEnrollmentTokenRepo(deps.db)

  return {
    create: async (_input: {
      ownerHumanPrincipalId: string
      tenantId: string
      usesTotal: number
      ttlSecs: number
      allowKeygen?: boolean
      metadata?: Record<string, unknown>
    }) => {
      throw new Error('not implemented')
    },

    revoke: async (id: string) => {
      const rows = await tokens.revoke(id, new Date())
      return rows[0] ?? null
    },

    list: tokens.list,
  }
}
