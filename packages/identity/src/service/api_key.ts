// Human API-Key service.
//
// A verified human's long-lived bearer credential. Authenticates calls
// to the identity write surface (enrollments, agent register, key
// rotation). The raw `chk_<token>` is surfaced once at issue and
// delivered out-of-band (typically by the mail Worker); the server
// retains only a peppered SHA-256.
//
//   issue(humanId)          → mint + insert + return raw token (once)
//   verify(rawToken)        → look up by hashed token, return owner row
//   revoke(apiKeyId, by)    → flip status='revoked', stamp revoked_at
//   listForOwner(humanId)   → admin / self read; never exposes hash

import { and, eq } from 'drizzle-orm'
import type { Db } from '../db'
import {
  agent,
  human,
  humanApiKey,
  tenant,
  tenantPrincipalMembership,
  type HumanRow,
  type HumanApiKeyRow,
} from '../db/schema'

// RFC-0002 phase 1 default. Phase 2 will replace this with the
// resolved realm of the owner's home tenant — when humans gain their
// own membership rows the lookup gets one less join. For now, an
// owner with no agents (and therefore no derivable realm) defaults to
// the seeded `primary` realm so cross-realm checks have a value to
// match against once they exist.
const DEFAULT_REALM_ID = 'rlm_0000000000000000000PR1MARY'

export type ApiKeyErrorCode =
  | 'api_key_invalid'
  | 'api_key_revoked'
  | 'api_key_expired'
  | 'api_key_not_found'
  | 'human_not_active'

export class ApiKeyError extends Error {
  readonly code: ApiKeyErrorCode
  readonly detail?: Record<string, unknown>
  constructor(code: ApiKeyErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiKeyError'
    this.code = code
    this.detail = detail
  }
}

export const API_KEY_PREFIX = 'chk_'

export type ApiKeyServiceDeps = {
  db: Db
  /** Peppered SHA-256 input. Reuses `_config.enrollment_pepper`. */
  pepper: Uint8Array
  /** Mint a `hak_<26-char ULID>`. */
  mintApiKeyId: () => string
  /** Mint a `chk_<…>` raw token; only the hash is stored. */
  mintToken: () => string
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
}

export type IssuedApiKey = {
  /** The raw `chk_<…>` token — surfaced once and never recoverable. */
  token: string
  /** Persistent row id (`hak_<…>`). */
  apiKeyId: string
  ownerHumanPrincipalId: string
  displayName: string | null
  expiresAt: Date | null
  createdAt: Date
}

export type ResolvedApiKey = {
  apiKeyId: string
  owner: HumanRow
  expiresAt: Date | null
  /**
   * Realm the owner currently lives in, looked up via the owner's
   * tenant membership (RFC-0002 phase 1). `null` if the owner has no
   * membership yet (e.g. fresh human with no agent registered) — the
   * caller decides whether to allow such requests.
   */
  realmId: string | null
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>

async function hashToken(raw: string, pepper: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(raw)
  const buf = new Uint8Array(pepper.length + enc.length)
  buf.set(pepper, 0)
  buf.set(enc, pepper.length)
  const out = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(out)
}

export function createApiKeyService(deps: ApiKeyServiceDeps) {
  const now = deps.now ?? Date.now

  return {
    /**
     * Mint a fresh API-Key for the given (verified) human. The raw
     * token is surfaced only here — the row stores only the hash.
     */
    async issue(input: {
      humanPrincipalId: string
      displayName?: string | null
      expiresAt?: Date | null
    }): Promise<IssuedApiKey> {
      const ownerRow = await deps.db
        .select()
        .from(human)
        .where(eq(human.principalId, input.humanPrincipalId))
        .limit(1)
      const owner = ownerRow[0]
      if (!owner) {
        throw new ApiKeyError('human_not_active', 'human not found')
      }
      if (owner.status !== 'active') {
        throw new ApiKeyError('human_not_active', 'human is not verified', {
          status: owner.status,
        })
      }

      const token = deps.mintToken()
      const tokenHash = await hashToken(token, deps.pepper)
      const apiKeyId = deps.mintApiKeyId()
      const createdAt = new Date(now())

      const [row] = await deps.db
        .insert(humanApiKey)
        .values({
          apiKeyId,
          tokenHash,
          ownerHumanPrincipalId: owner.principalId,
          displayName: input.displayName ?? null,
          status: 'active',
          expiresAt: input.expiresAt ?? null,
          createdAt,
        })
        .returning()
      if (!row) throw new Error('human_api_key insert returned no row')

      return {
        token,
        apiKeyId: row.apiKeyId,
        ownerHumanPrincipalId: row.ownerHumanPrincipalId,
        displayName: row.displayName,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      }
    },

    /**
     * Resolve a presented `chk_…` token to the active key + owner row.
     * Throws ApiKeyError on every failure mode the caller might want to
     * surface as 401. Updates `last_used_at` best-effort.
     */
    async verify(rawToken: string): Promise<ResolvedApiKey> {
      if (!rawToken.startsWith(API_KEY_PREFIX)) {
        throw new ApiKeyError('api_key_invalid', 'token prefix mismatch')
      }
      const tokenHash = await hashToken(rawToken, deps.pepper)
      const rows = await deps.db
        .select()
        .from(humanApiKey)
        .where(eq(humanApiKey.tokenHash, tokenHash))
        .limit(1)
      const row = rows[0]
      if (!row) throw new ApiKeyError('api_key_invalid', 'token not recognised')
      if (row.status === 'revoked') {
        throw new ApiKeyError('api_key_revoked', 'this key has been revoked')
      }
      const tNow = new Date(now())
      if (row.expiresAt && row.expiresAt.getTime() <= tNow.getTime()) {
        throw new ApiKeyError('api_key_expired', 'this key has expired')
      }

      const ownerRows = await deps.db
        .select()
        .from(human)
        .where(eq(human.principalId, row.ownerHumanPrincipalId))
        .limit(1)
      const owner = ownerRows[0]
      if (!owner) throw new ApiKeyError('api_key_invalid', 'owner missing')
      if (owner.status !== 'active') {
        throw new ApiKeyError('human_not_active', 'owner is not verified', {
          status: owner.status,
        })
      }

      // Best-effort timestamp update — do not gate the request on this.
      await deps.db
        .update(humanApiKey)
        .set({ lastUsedAt: tNow })
        .where(eq(humanApiKey.apiKeyId, row.apiKeyId))

      // Resolve the owner's realm via any agent they own. Multi-agent
      // owners with agents spanning realms get the first row D1
      // returns — phase 2 will define a deterministic policy.
      const realmRows = await deps.db
        .select({ realmId: tenant.realmId })
        .from(agent)
        .innerJoin(
          tenantPrincipalMembership,
          eq(tenantPrincipalMembership.principalId, agent.principalId),
        )
        .innerJoin(tenant, eq(tenant.tenantId, tenantPrincipalMembership.tenantId))
        .where(eq(agent.ownerHumanPrincipalId, row.ownerHumanPrincipalId))
        .limit(1)
      const realmId = realmRows[0]?.realmId ?? DEFAULT_REALM_ID

      return {
        apiKeyId: row.apiKeyId,
        owner,
        expiresAt: row.expiresAt,
        realmId,
      }
    },

    /**
     * Mark a single key as revoked. Idempotent — calling on an already
     * revoked row succeeds silently. The 404 is reserved for unknown
     * IDs.
     */
    async revoke(apiKeyId: string, ownerHumanPrincipalId: string): Promise<HumanApiKeyRow> {
      const rows = await deps.db
        .select()
        .from(humanApiKey)
        .where(
          and(
            eq(humanApiKey.apiKeyId, apiKeyId),
            eq(humanApiKey.ownerHumanPrincipalId, ownerHumanPrincipalId),
          ),
        )
        .limit(1)
      const row = rows[0]
      if (!row) throw new ApiKeyError('api_key_not_found', 'no such api-key for this owner')
      if (row.status === 'revoked') return row

      const tNow = new Date(now())
      const [updated] = await deps.db
        .update(humanApiKey)
        .set({ status: 'revoked', revokedAt: tNow })
        .where(eq(humanApiKey.apiKeyId, apiKeyId))
        .returning()
      if (!updated) throw new Error('human_api_key revoke returned no row')
      return updated
    },

    /** Read-only list of a human's keys (no hash, no token). */
    listForOwner: async (humanPrincipalId: string): Promise<HumanApiKeyRow[]> =>
      deps.db
        .select()
        .from(humanApiKey)
        .where(eq(humanApiKey.ownerHumanPrincipalId, humanPrincipalId)),
  }
}
