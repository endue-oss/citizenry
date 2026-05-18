import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db'
import {
  adminRefreshToken,
  type AdminRefreshTokenRow,
} from '../db/schema'

export type AdminRefreshTokenRepo = ReturnType<typeof createAdminRefreshTokenRepo>

export const createAdminRefreshTokenRepo = (db: Db) => ({
  findByHash: (
    tokenHash: Uint8Array,
  ): Promise<AdminRefreshTokenRow | undefined> =>
    db
      .select()
      .from(adminRefreshToken)
      .where(eq(adminRefreshToken.tokenHash, tokenHash))
      .limit(1)
      .then((rows) => rows[0]),

  insert: (input: {
    adminRefreshTokenId: string
    tokenHash: Uint8Array
    adminId: string
    expiresAt: Date
  }): Promise<AdminRefreshTokenRow | undefined> =>
    db
      .insert(adminRefreshToken)
      .values({
        adminRefreshTokenId: input.adminRefreshTokenId,
        tokenHash: input.tokenHash,
        adminId: input.adminId,
        expiresAt: input.expiresAt,
      })
      .returning()
      .then((rows) => rows[0]),

  /**
   * Mark a token as rotated: stamp `revoked_at` and `replaced_by`. The
   * second-call protection (replay) is the caller's job — read the row,
   * confirm both `revoked_at` and `replaced_by` are null, then call this.
   */
  rotate: (input: {
    id: string
    replacedBy: string
    revokedAt: Date
  }): Promise<AdminRefreshTokenRow | undefined> =>
    db
      .update(adminRefreshToken)
      .set({ replacedBy: input.replacedBy, revokedAt: input.revokedAt })
      .where(eq(adminRefreshToken.adminRefreshTokenId, input.id))
      .returning()
      .then((rows) => rows[0]),

  /** Explicit revoke (logout / forced sign-out). */
  revoke: (id: string, at: Date): Promise<AdminRefreshTokenRow[]> =>
    db
      .update(adminRefreshToken)
      .set({ revokedAt: at })
      .where(
        and(
          eq(adminRefreshToken.adminRefreshTokenId, id),
          isNull(adminRefreshToken.revokedAt),
        ),
      )
      .returning(),

  /** Cascade revoke — used after a replay attempt is detected. */
  revokeAllForAdmin: (
    adminId: string,
    at: Date,
  ): Promise<AdminRefreshTokenRow[]> =>
    db
      .update(adminRefreshToken)
      .set({ revokedAt: at })
      .where(
        and(
          eq(adminRefreshToken.adminId, adminId),
          isNull(adminRefreshToken.revokedAt),
        ),
      )
      .returning(),
})
