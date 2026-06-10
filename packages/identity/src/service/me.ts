// /v1/agent/me self-service — whoami, rotate-key, self-revoke.
//
// whoami authenticates via the bearer JWT (verified by the app's auth
// middleware before the router runs); rotate-key and self-revoke
// authenticate via the body JWS (service/token.ts verifyBodyJws).

import { eq } from 'drizzle-orm'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import type { Db } from '../db'
import {
  tenant as tenantTable,
  tenantPrincipalMembership,
  type AgentRow,
  type AgentKeyRow,
} from '../db/schema'
import { createAgentRepo } from '../repo/agent'
import { createAgentKeyRepo } from '../repo/agent_key'
import { AuthError, ROTATED_KEY_GRACE_SEC } from '../auth'
import { base64urlToBytes } from '../jose'
import { createTokenService, type TokenServicePorts } from './token'

export interface WhoamiResult {
  agent: AgentRow
  /** The currently active signing key. */
  sigKey: AgentKeyRow
  tenantSlug: string
}

export interface RotateKeyResult {
  prevKid: string
  newKid: string
  /** End of the old key's bearer-JWT verification grace window. */
  rotatedUntil: Date
}

/** Test seam — the default implementation hits the real D1 tables. */
export interface MeServicePorts {
  findAgentById(agentId: string): Promise<AgentRow | undefined>
  findActiveSigKeyByAgent(agentId: string): Promise<AgentKeyRow | undefined>
  findTenantSlugByPrincipal(principalId: string): Promise<string | undefined>
  insertSigKey(input: {
    agentId: string
    kid: string
    publicKey: Uint8Array
    createdAt: Date
  }): Promise<void>
  markRotated(kid: string, rotatedAt: Date): Promise<void>
  revokeAgent(agentId: string, revokedAt: Date): Promise<void>
}

const dbPorts = (db: Db): MeServicePorts => {
  const agents = createAgentRepo(db)
  const keys = createAgentKeyRepo(db)
  return {
    findAgentById: async (agentId) => (await agents.findById(agentId))[0],
    findActiveSigKeyByAgent: async (agentId) =>
      (await keys.findActiveByAgent(agentId))[0],
    findTenantSlugByPrincipal: async (principalId) => {
      const rows = await db
        .select({ slug: tenantTable.slug })
        .from(tenantPrincipalMembership)
        .innerJoin(tenantTable, eq(tenantPrincipalMembership.tenantId, tenantTable.tenantId))
        .where(eq(tenantPrincipalMembership.principalId, principalId))
        .limit(1)
      return rows[0]?.slug
    },
    insertSigKey: async (input) => {
      await keys.create({
        agentId: input.agentId,
        kid: input.kid,
        publicKey: input.publicKey,
        algorithm: 'EdDSA',
        use: 'sig',
        status: 'active',
        createdAt: input.createdAt,
      })
    },
    markRotated: async (kid, rotatedAt) => {
      await keys.rotate(kid, rotatedAt)
    },
    revokeAgent: async (agentId, revokedAt) => {
      // Flip the agent first: even if the key update below fails, a
      // revoked agent row already blocks every authenticated surface.
      await agents.setStatus(agentId, 'revoked')
      await keys.revokeAllForAgent(agentId, revokedAt)
    },
  }
}

/** Shape of the `payload.new_public_key_jwk` field of a rotate-key JWS. */
const validateNewSigJwk = (inner: unknown): Uint8Array => {
  const fail = (message: string): never => {
    throw new AuthError(IDENTITY_ERR.jwk_invalid, message)
  }
  if (!inner || typeof inner !== 'object') {
    fail('payload.new_public_key_jwk must be an object')
  }
  const jwk = (inner as Record<string, unknown>).new_public_key_jwk as
    | Record<string, unknown>
    | undefined
  if (!jwk || typeof jwk !== 'object') {
    fail('payload.new_public_key_jwk is required')
  }
  const j = jwk as Record<string, unknown>
  if (j.kty !== 'OKP') fail('new key kty must be "OKP"')
  if (j.crv !== 'Ed25519') fail('new key crv must be "Ed25519"')
  if (j.alg !== undefined && j.alg !== 'EdDSA') fail('new key alg must be "EdDSA"')
  if ('kid' in j) {
    // The server issues kids — a client-chosen kid could collide with
    // (or impersonate) another agent's key id.
    fail('new key must not carry a kid (the server issues it)')
  }
  if (typeof j.x !== 'string' || j.x.length === 0) {
    fail('new key x must be a base64url string')
  }
  let raw: Uint8Array
  try {
    raw = base64urlToBytes(j.x as string)
  } catch {
    return fail('new key x is not valid base64url')
  }
  if (raw.length !== 32) fail('new key x must decode to 32 bytes')
  return raw
}

export type MeService = ReturnType<typeof createMeService>

export const createMeService = (deps: {
  db: Db
  audience: string[]
  /** Mint key id (`kid_<ULID>`). */
  mintKid: () => string
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
  /** Inject for tests; defaults to D1-backed lookups over `db`. */
  ports?: MeServicePorts
  /** Inject for tests — forwarded to the inner token service. */
  tokenPorts?: TokenServicePorts
}) => {
  const now = deps.now ?? Date.now
  const ports = deps.ports ?? dbPorts(deps.db)
  const token = createTokenService({
    db: deps.db,
    audience: deps.audience,
    now,
    ports: deps.tokenPorts,
  })

  return {
    whoami: async (agentId: string): Promise<WhoamiResult> => {
      const agent = await ports.findAgentById(agentId)
      if (!agent) {
        throw new AuthError(IDENTITY_ERR.not_found, 'agent not found')
      }
      const sigKey = await ports.findActiveSigKeyByAgent(agentId)
      if (!sigKey) {
        // Registration always writes an active sig key, and rotation
        // replaces it atomically enough that a gap is an invariant
        // breach worth surfacing loudly.
        throw new AuthError(IDENTITY_ERR.internal, 'active signing key missing')
      }
      const tenantSlug = await ports.findTenantSlugByPrincipal(agentId)
      if (!tenantSlug) {
        throw new AuthError(IDENTITY_ERR.internal, 'tenant membership missing')
      }
      return { agent, sigKey, tenantSlug }
    },

    rotateKey: async (jws: string): Promise<RotateKeyResult> => {
      const { payload, key } = await token.verifyBodyJws(jws, 'rotate-key')
      const newPublicKey = validateNewSigJwk(payload.payload)

      const tNow = new Date(now())
      const newKid = deps.mintKid()

      // D1 has no multi-statement transaction here; insert the new key
      // first so a mid-flight failure leaves the old key active and the
      // operation retryable (the reverse order would strand the agent
      // with no active key).
      await ports.insertSigKey({
        agentId: key.agentId,
        kid: newKid,
        publicKey: newPublicKey,
        createdAt: tNow,
      })
      await ports.markRotated(key.kid, tNow)

      return {
        prevKid: key.kid,
        newKid,
        rotatedUntil: new Date(tNow.getTime() + ROTATED_KEY_GRACE_SEC * 1000),
      }
    },

    selfRevoke: async (jws: string): Promise<void> => {
      const { agent } = await token.verifyBodyJws(jws, 'revoke')
      await ports.revokeAgent(agent.principalId, new Date(now()))
    },
  }
}
