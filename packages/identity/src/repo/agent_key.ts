import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db'
import { agentKey } from '../db/schema'

export type AgentKeyRepo = ReturnType<typeof createAgentKeyRepo>

export const createAgentKeyRepo = (db: Db) => ({
  findByKid: (kid: string) =>
    db.select().from(agentKey).where(eq(agentKey.kid, kid)).limit(1),

  // ── signing keys (use='sig', EdDSA) ──────────────────────────
  /** kid → signing-key row regardless of status (callers branch on it). */
  findSigByKid: (kid: string) =>
    db
      .select()
      .from(agentKey)
      .where(and(eq(agentKey.kid, kid), eq(agentKey.use, 'sig')))
      .limit(1),

  findActiveByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(
        and(
          eq(agentKey.agentId, agentId),
          eq(agentKey.use, 'sig'),
          eq(agentKey.status, 'active'),
        ),
      )
      .limit(1),

  listValidByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(
        and(
          eq(agentKey.agentId, agentId),
          eq(agentKey.use, 'sig'),
          inArray(agentKey.status, ['active', 'rotated']),
        ),
      ),

  // ── encryption keys (use='enc', X25519) ──────────────────────
  findActiveEncByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(
        and(
          eq(agentKey.agentId, agentId),
          eq(agentKey.use, 'enc'),
          eq(agentKey.status, 'active'),
        ),
      )
      .limit(1),

  listValidEncByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(
        and(
          eq(agentKey.agentId, agentId),
          eq(agentKey.use, 'enc'),
          inArray(agentKey.status, ['active', 'rotated']),
        ),
      ),

  // ── all keys (both uses) ─────────────────────────────────────
  listByAgent: (agentId: string) =>
    db.select().from(agentKey).where(eq(agentKey.agentId, agentId)),

  create: (input: typeof agentKey.$inferInsert) =>
    db.insert(agentKey).values(input).returning(),

  rotate: (oldKid: string, rotatedAt: Date) =>
    db
      .update(agentKey)
      .set({ status: 'rotated', rotatedAt })
      .where(and(eq(agentKey.kid, oldKid), eq(agentKey.status, 'active')))
      .returning(),

  revokeAllForAgent: (agentId: string, revokedAt: Date = new Date()) =>
    db
      .update(agentKey)
      .set({ status: 'revoked', revokedAt })
      .where(eq(agentKey.agentId, agentId))
      .returning(),
})
