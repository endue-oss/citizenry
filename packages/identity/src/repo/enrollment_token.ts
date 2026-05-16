import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { enrollmentToken } from '../db/schema'

export type EnrollmentTokenRepo = ReturnType<typeof createEnrollmentTokenRepo>

export const createEnrollmentTokenRepo = (db: Db) => ({
  findById: (id: string) =>
    db
      .select()
      .from(enrollmentToken)
      .where(eq(enrollmentToken.enrollmentTokenId, id))
      .limit(1),

  findByHash: (tokenHash: Uint8Array) =>
    db
      .select()
      .from(enrollmentToken)
      .where(eq(enrollmentToken.tokenHash, tokenHash))
      .limit(1),

  list: (filter: { ownerHumanPrincipalId?: string; tenantId?: string }) => {
    const conditions = []
    if (filter.ownerHumanPrincipalId)
      conditions.push(eq(enrollmentToken.ownerHumanPrincipalId, filter.ownerHumanPrincipalId))
    if (filter.tenantId) conditions.push(eq(enrollmentToken.tenantId, filter.tenantId))
    return conditions.length
      ? db.select().from(enrollmentToken).where(and(...conditions))
      : db.select().from(enrollmentToken)
  },

  create: (input: typeof enrollmentToken.$inferInsert) =>
    db.insert(enrollmentToken).values(input).returning(),

  /**
   * uses_left atomic decrement.
   * WHERE: token_hash 매칭 AND not revoked AND uses_left > 0 AND expires_at > now.
   * 반환 row 가 비면 invalid/exhausted → caller 가 410 처리.
   */
  consume: (tokenHash: Uint8Array, now: Date) =>
    db
      .update(enrollmentToken)
      .set({
        usesLeft: sql`${enrollmentToken.usesLeft} - 1`,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(enrollmentToken.tokenHash, tokenHash),
          isNull(enrollmentToken.revokedAt),
          gt(enrollmentToken.usesLeft, 0),
          gt(enrollmentToken.expiresAt, now),
        ),
      )
      .returning(),

  revoke: (id: string, now: Date) =>
    db
      .update(enrollmentToken)
      .set({ revokedAt: now })
      .where(
        and(eq(enrollmentToken.enrollmentTokenId, id), isNull(enrollmentToken.revokedAt)),
      )
      .returning(),
})
