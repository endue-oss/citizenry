import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db'
import { agentKey } from '../db/schema'

export type AgentKeyRepo = ReturnType<typeof createAgentKeyRepo>

export const createAgentKeyRepo = (db: Db) => ({
  findByKid: (kid: string) =>
    db.select().from(agentKey).where(eq(agentKey.kid, kid)).limit(1),

  findActiveByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(and(eq(agentKey.agentId, agentId), eq(agentKey.status, 'active')))
      .limit(1),

  listValidByAgent: (agentId: string) =>
    db
      .select()
      .from(agentKey)
      .where(
        and(
          eq(agentKey.agentId, agentId),
          inArray(agentKey.status, ['active', 'rotated']),
        ),
      ),

  listByAgent: (agentId: string) =>
    db.select().from(agentKey).where(eq(agentKey.agentId, agentId)),

  create: (input: typeof agentKey.$inferInsert) =>
    db.insert(agentKey).values(input).returning(),

  rotate: (oldKid: string) =>
    db
      .update(agentKey)
      .set({ status: 'rotated' })
      .where(and(eq(agentKey.kid, oldKid), eq(agentKey.status, 'active')))
      .returning(),

  revokeAllForAgent: (agentId: string) =>
    db
      .update(agentKey)
      .set({ status: 'revoked', revokedAt: new Date() })
      .where(eq(agentKey.agentId, agentId))
      .returning(),
})
