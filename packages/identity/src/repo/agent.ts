import { eq, and } from 'drizzle-orm'
import type { Db } from '../db'
import { agent } from '../db/schema'

export type AgentRepo = ReturnType<typeof createAgentRepo>

export const createAgentRepo = (db: Db) => ({
  findById: (principalId: string) =>
    db.select().from(agent).where(eq(agent.principalId, principalId)).limit(1),

  findBySlug: (slug: string) =>
    db.select().from(agent).where(eq(agent.slug, slug)).limit(1),

  findByOwner: (ownerHumanPrincipalId: string) =>
    db
      .select()
      .from(agent)
      .where(eq(agent.ownerHumanPrincipalId, ownerHumanPrincipalId)),

  create: (input: typeof agent.$inferInsert) =>
    db.insert(agent).values(input).returning(),

  setStatus: (principalId: string, status: 'active' | 'revoked') =>
    db
      .update(agent)
      .set({ status, updatedAt: new Date() })
      .where(eq(agent.principalId, principalId))
      .returning(),

  list: (filter: {
    status?: 'active' | 'revoked'
    ownerHumanPrincipalId?: string
  }) => {
    const conditions = []
    if (filter.status) conditions.push(eq(agent.status, filter.status))
    if (filter.ownerHumanPrincipalId)
      conditions.push(eq(agent.ownerHumanPrincipalId, filter.ownerHumanPrincipalId))
    return conditions.length
      ? db.select().from(agent).where(and(...conditions))
      : db.select().from(agent)
  },
})
