import type { Db } from '../db'
import { createEnrollmentTokenRepo } from '../repo/enrollment_token'

export type EnrollmentService = ReturnType<typeof createEnrollmentService>

/**
 * Enrollment issue / revoke / consume.
 *
 * Not implemented — at the service layer:
 *   - Generate raw token (`eret_<32+chars>`)
 *   - peppered SHA-256 hash
 *   - DB insert
 *   - Expose raw token in the response exactly once
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
