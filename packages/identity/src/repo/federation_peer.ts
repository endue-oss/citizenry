import { and, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { federationPeer, tenant } from '../db/schema'
import type { FederationPeerRow } from '../db/schema'

export type FederationPeerRepo = ReturnType<typeof createFederationPeerRepo>

/**
 * Drizzle repo — federation_peer 와 tenant 의 1:1 링크 유지가 책임.
 *
 * Service 가 호출 — auth / 검증은 service 단.
 */
export const createFederationPeerRepo = (db: Db) => ({
  findById: async (id: string): Promise<FederationPeerRow | undefined> => {
    const rows = await db
      .select()
      .from(federationPeer)
      .where(eq(federationPeer.federationPeerId, id))
      .limit(1)
    return rows[0]
  },

  findByIssuer: async (issuer: string): Promise<FederationPeerRow | undefined> => {
    const rows = await db
      .select()
      .from(federationPeer)
      .where(eq(federationPeer.issuer, issuer))
      .limit(1)
    return rows[0]
  },

  /**
   * issuer 가 unique 이지만 revoked 가 누적될 수 있으므로 "현재 살아있는" row 만 조회.
   */
  findActiveByIssuer: async (issuer: string): Promise<FederationPeerRow | undefined> => {
    const rows = await db
      .select()
      .from(federationPeer)
      .where(and(eq(federationPeer.issuer, issuer), ne(federationPeer.state, 'revoked')))
      .limit(1)
    return rows[0]
  },

  list: (opts: { state?: string; page: number; limit: number }) => {
    const offset = (opts.page - 1) * opts.limit
    const cond = opts.state ? eq(federationPeer.state, opts.state) : undefined
    return db
      .select()
      .from(federationPeer)
      .where(cond)
      .orderBy(sql`${federationPeer.createdAt} DESC`)
      .limit(opts.limit)
      .offset(offset)
  },

  count: async (state?: string): Promise<number> => {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(federationPeer)
      .where(state ? eq(federationPeer.state, state) : undefined)
    return Number(rows[0]?.count ?? 0)
  },

  insert: (input: typeof federationPeer.$inferInsert) =>
    db.insert(federationPeer).values(input).returning(),

  update: (id: string, patch: Partial<typeof federationPeer.$inferInsert>) =>
    db
      .update(federationPeer)
      .set({ ...patch, updatedAt: sql`NOW()` })
      .where(eq(federationPeer.federationPeerId, id))
      .returning(),

  /** trusted 진입 시 federated tenant materialize + peer.tenant_id 갱신을 한 트랜잭션에서. */
  linkFederatedTenant: (id: string, tenantInput: typeof tenant.$inferInsert) =>
    db.transaction(async (tx) => {
      const [createdTenant] = await tx.insert(tenant).values(tenantInput).returning()
      const [updatedPeer] = await tx
        .update(federationPeer)
        .set({
          tenantId: createdTenant.tenantId,
          state: 'trusted',
          trustedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(federationPeer.federationPeerId, id))
        .returning()
      return { tenant: createdTenant, peer: updatedPeer }
    }),

  /** revoke — peer 폐기 + 연결된 tenant 를 archived 로. */
  revoke: (id: string, tenantId: string | null) =>
    db.transaction(async (tx) => {
      const [updatedPeer] = await tx
        .update(federationPeer)
        .set({
          state: 'revoked',
          revokedAt: sql`NOW()`,
          updatedAt: sql`NOW()`,
        })
        .where(eq(federationPeer.federationPeerId, id))
        .returning()
      if (tenantId) {
        await tx
          .update(tenant)
          .set({ status: 'archived', updatedAt: sql`NOW()` })
          .where(eq(tenant.tenantId, tenantId))
      }
      return updatedPeer
    }),
})
