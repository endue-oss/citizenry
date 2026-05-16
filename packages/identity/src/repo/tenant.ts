import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { tenant, tenantPrincipalMembership } from '../db/schema'

export type TenantRepo = ReturnType<typeof createTenantRepo>

export const createTenantRepo = (db: Db) => ({
  findById: (id: string) =>
    db.select().from(tenant).where(eq(tenant.tenantId, id)).limit(1),

  findBySlug: (slug: string) =>
    db.select().from(tenant).where(eq(tenant.slug, slug)).limit(1),

  create: (input: typeof tenant.$inferInsert) =>
    db.insert(tenant).values(input).returning(),

  addMember: (input: typeof tenantPrincipalMembership.$inferInsert) =>
    db.insert(tenantPrincipalMembership).values(input).returning(),

  removeMember: (tenantId: string, principalId: string) =>
    db
      .delete(tenantPrincipalMembership)
      .where(eq(tenantPrincipalMembership.tenantId, tenantId))
      .returning(),

  listMembers: (tenantId: string) =>
    db
      .select()
      .from(tenantPrincipalMembership)
      .where(eq(tenantPrincipalMembership.tenantId, tenantId)),
})
