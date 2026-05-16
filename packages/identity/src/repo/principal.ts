import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { principal } from '../db/schema'

export type PrincipalRepo = ReturnType<typeof createPrincipalRepo>

export const createPrincipalRepo = (db: Db) => ({
  findById: (id: string) =>
    db.select().from(principal).where(eq(principal.principalId, id)).limit(1),

  create: (input: typeof principal.$inferInsert) =>
    db.insert(principal).values(input).returning(),
})
