import { and, eq, ne, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { federationPeer, tenant } from '../db/schema'
import type { FederationPeerRow } from '../db/schema'

export type FederationPeerRepo = ReturnType<typeof createFederationPeerRepo>

const nowMs = () => sql`(unixepoch() * 1000)`

/**
 * Drizzle repo — responsible for maintaining the 1:1 link between federation_peer and tenant.
 *
 * Called by the service layer — auth / validation live in the service.
 *
 * Built on D1 (SQLite), so we use batch instead of transactions. tenant.tenant_id
 * is an app-generated ULID PK, so a batch does not have to wait on a prior INSERT result.
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
   * issuer is unique, but revoked rows accumulate — so this returns only the "currently live" row.
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
      .select({ count: sql<number>`count(*)` })
      .from(federationPeer)
      .where(state ? eq(federationPeer.state, state) : undefined)
    return Number(rows[0]?.count ?? 0)
  },

  insert: (input: typeof federationPeer.$inferInsert): Promise<FederationPeerRow[]> =>
    db.insert(federationPeer).values(input).returning(),

  update: async (
    id: string,
    patch: Partial<typeof federationPeer.$inferInsert>,
  ): Promise<FederationPeerRow[]> =>
    db
      .update(federationPeer)
      .set({ ...patch, updatedAt: nowMs() as unknown as Date })
      .where(eq(federationPeer.federationPeerId, id))
      .returning(),

  /** On entering trusted state, atomically materialize the federated tenant + update peer.tenant_id. */
  linkFederatedTenant: async (
    id: string,
    tenantInput: typeof tenant.$inferInsert,
  ) => {
    await db.batch([
      db.insert(tenant).values(tenantInput),
      db
        .update(federationPeer)
        .set({
          tenantId: tenantInput.tenantId,
          state: 'trusted',
          trustedAt: nowMs() as unknown as Date,
          updatedAt: nowMs() as unknown as Date,
        })
        .where(eq(federationPeer.federationPeerId, id)),
    ])

    const [createdTenant] = await db
      .select()
      .from(tenant)
      .where(eq(tenant.tenantId, tenantInput.tenantId!))
      .limit(1)
    const [updatedPeer] = await db
      .select()
      .from(federationPeer)
      .where(eq(federationPeer.federationPeerId, id))
      .limit(1)
    if (!createdTenant || !updatedPeer) {
      throw new Error('linkFederatedTenant failed to read back row(s)')
    }
    return { tenant: createdTenant, peer: updatedPeer }
  },

  /** revoke — terminate the peer + move its linked tenant to archived. */
  revoke: async (id: string, tenantId: string | null) => {
    const stmts = [
      db
        .update(federationPeer)
        .set({
          state: 'revoked',
          revokedAt: nowMs() as unknown as Date,
          updatedAt: nowMs() as unknown as Date,
        })
        .where(eq(federationPeer.federationPeerId, id)),
    ] as const

    if (tenantId) {
      await db.batch([
        ...stmts,
        db
          .update(tenant)
          .set({ status: 'archived', updatedAt: nowMs() as unknown as Date })
          .where(eq(tenant.tenantId, tenantId)),
      ] as unknown as Parameters<typeof db.batch>[0])
    } else {
      await db.batch(stmts as unknown as Parameters<typeof db.batch>[0])
    }

    const [updatedPeer] = await db
      .select()
      .from(federationPeer)
      .where(eq(federationPeer.federationPeerId, id))
      .limit(1)
    if (!updatedPeer) throw new Error('revoke failed to read back row')
    return updatedPeer
  },
})
