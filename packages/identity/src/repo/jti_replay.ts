import { eq, lt } from 'drizzle-orm'
import type { Db } from '../db'
import { jtiReplay } from '../db/schema'

export type JtiReplayRepo = ReturnType<typeof createJtiReplayRepo>

export const createJtiReplayRepo = (db: Db) => ({
  /**
   * INSERT ON CONFLICT DO NOTHING — blocks replays.
   * Empty returned row means the jti was already used (replay).
   */
  claim: (jti: string, expiresAt: Date) =>
    db
      .insert(jtiReplay)
      .values({ jti, expiresAt })
      .onConflictDoNothing({ target: jtiReplay.jti })
      .returning(),

  findById: (jti: string) =>
    db.select().from(jtiReplay).where(eq(jtiReplay.jti, jti)).limit(1),

  /** Cleanup expired jti rows (cron). */
  cleanupExpired: (now: Date) =>
    db.delete(jtiReplay).where(lt(jtiReplay.expiresAt, now)).returning(),
})
