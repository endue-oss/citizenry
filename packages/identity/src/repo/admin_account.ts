import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { adminAccount, type AdminAccountRow } from '../db/schema'

export type AdminAccountRepo = ReturnType<typeof createAdminAccountRepo>

export const createAdminAccountRepo = (db: Db) => ({
  findById: (id: string): Promise<AdminAccountRow | undefined> =>
    db
      .select()
      .from(adminAccount)
      .where(eq(adminAccount.adminId, id))
      .limit(1)
      .then((rows) => rows[0]),

  upsert: (input: {
    adminId: string
    passwordHash: Uint8Array
    passwordSalt: Uint8Array
    iterations: number
  }): Promise<AdminAccountRow | undefined> =>
    db
      .insert(adminAccount)
      .values({
        adminId: input.adminId,
        passwordHash: input.passwordHash,
        passwordSalt: input.passwordSalt,
        iterations: input.iterations,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: adminAccount.adminId,
        set: {
          passwordHash: input.passwordHash,
          passwordSalt: input.passwordSalt,
          iterations: input.iterations,
          updatedAt: new Date(),
        },
      })
      .returning()
      .then((rows) => rows[0]),
})
