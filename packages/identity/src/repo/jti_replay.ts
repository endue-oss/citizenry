import { eq, lt } from 'drizzle-orm'
import type { Db } from '../db'
import { jtiReplay } from '../db/schema'

export type JtiReplayRepo = ReturnType<typeof createJtiReplayRepo>

export const createJtiReplayRepo = (db: Db) => ({
  /**
   * INSERT ON CONFLICT DO NOTHING — replay 차단.
   * 반환 row 가 비면 이미 사용된 jti (replay).
   */
  claim: (jti: string, expiresAt: Date) =>
    db
      .insert(jtiReplay)
      .values({ jti, expiresAt })
      .onConflictDoNothing({ target: jtiReplay.jti })
      .returning(),

  findById: (jti: string) =>
    db.select().from(jtiReplay).where(eq(jtiReplay.jti, jti)).limit(1),

  /** 만료된 jti cleanup (cron). */
  cleanupExpired: (now: Date) =>
    db.delete(jtiReplay).where(lt(jtiReplay.expiresAt, now)).returning(),
})
