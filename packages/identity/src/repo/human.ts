import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { human } from '../db/schema'

export type HumanRepo = ReturnType<typeof createHumanRepo>

export const createHumanRepo = (db: Db) => ({
  findById: (principalId: string) =>
    db.select().from(human).where(eq(human.principalId, principalId)).limit(1),

  findByMail: (mail: string) =>
    db.select().from(human).where(eq(human.mail, mail)).limit(1),

  create: (input: typeof human.$inferInsert) =>
    db.insert(human).values(input).returning(),
})
