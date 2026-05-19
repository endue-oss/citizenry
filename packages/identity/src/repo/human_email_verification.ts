import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { humanEmailVerification, type HumanEmailVerificationRow } from '../db/schema'

export type HumanEmailVerificationRepo = ReturnType<typeof createHumanEmailVerificationRepo>

export const createHumanEmailVerificationRepo = (db: Db) => ({
  findByPrincipal: async (
    principalId: string,
  ): Promise<HumanEmailVerificationRow | undefined> => {
    const rows = await db
      .select()
      .from(humanEmailVerification)
      .where(eq(humanEmailVerification.principalId, principalId))
      .limit(1)
    return rows[0]
  },

  create: (input: typeof humanEmailVerification.$inferInsert) =>
    db.insert(humanEmailVerification).values(input).returning(),

  /** Replace the existing row's code hash + send timestamps (used on resend). */
  updateResend: async (
    principalId: string,
    patch: {
      codeHash: Uint8Array
      lastSentAt: Date
      nextResendAt: Date
      resendCount: number
    },
  ): Promise<HumanEmailVerificationRow | undefined> => {
    const rows = await db
      .update(humanEmailVerification)
      .set({
        codeHash: patch.codeHash,
        lastSentAt: patch.lastSentAt,
        nextResendAt: patch.nextResendAt,
        resendCount: patch.resendCount,
        updatedAt: new Date(),
      })
      .where(eq(humanEmailVerification.principalId, principalId))
      .returning()
    return rows[0]
  },

  /** Mark the verification as completed; called when the code matches. */
  markVerified: async (
    principalId: string,
    verifiedAt: Date,
  ): Promise<HumanEmailVerificationRow | undefined> => {
    const rows = await db
      .update(humanEmailVerification)
      .set({ verifiedAt, updatedAt: new Date() })
      .where(eq(humanEmailVerification.principalId, principalId))
      .returning()
    return rows[0]
  },

  /** Drop the row when an expired pending registration is restarted. */
  deleteByPrincipal: (principalId: string) =>
    db.delete(humanEmailVerification).where(eq(humanEmailVerification.principalId, principalId)),
})
