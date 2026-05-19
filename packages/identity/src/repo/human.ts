import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { human } from '../db/schema'

export type HumanRepo = ReturnType<typeof createHumanRepo>

export const createHumanRepo = (db: Db) => ({
  findById: (principalId: string) =>
    db.select().from(human).where(eq(human.principalId, principalId)).limit(1),

  findByEmail: (email: string) =>
    db.select().from(human).where(eq(human.email, email)).limit(1),

  create: (input: typeof human.$inferInsert) =>
    db.insert(human).values(input).returning(),
})
