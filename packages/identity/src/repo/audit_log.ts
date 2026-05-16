import type { Db } from '../db'
import { auditLog } from '../db/schema'

export type AuditLogRepo = ReturnType<typeof createAuditLogRepo>

export const createAuditLogRepo = (db: Db) => ({
  insert: (input: typeof auditLog.$inferInsert) =>
    db.insert(auditLog).values(input).returning(),
})
