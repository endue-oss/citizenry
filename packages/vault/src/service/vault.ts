import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { TokenVerifier } from '@citizenry/identity/auth'
import type { Schema } from '../db/schema'
import { createEntryRepo } from '../repo/entry'

export const createVaultService = (deps: {
  db: DrizzleD1Database<Schema>
  verifier: TokenVerifier
}) => {
  const entries = createEntryRepo(deps.db)

  return {
    list: (ownerId: string) => entries.listByOwner(ownerId),
    get: (id: string) => entries.findById(id),
    create: (input: { ownerId: string; data: string }) =>
      entries.create({
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        data: input.data,
        createdAt: new Date(),
      }),
  }
}
