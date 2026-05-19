// Agent registration. Replaces the earlier enrollment-bearer flow:
// the caller authenticates with their human API-Key (`chk_…`), the
// router resolves the owner human, and this service mints a fresh
// agent + initial Ed25519 key under that owner.
//
//   1. Validate the keying request — exactly one of `publicKeyJwk` /
//      `generateKeypair` must be present.
//   2. (When asked) Generate an Ed25519 keypair via WebCrypto.
//   3. Slug uniqueness check.
//   4. Insert principal (kind='agent') + agent + agent_key (status=active).
//   5. Return everything; the raw private JWK is surfaced once when the
//      server keygen path is taken.

import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import {
  principal,
  agent,
  agentKey,
  tenant,
  tenantPrincipalMembership,
  type AgentRow,
  type AgentKeyRow,
} from '../db/schema'

export type RegisterErrorCode =
  | 'jwk_invalid'
  | 'jwk_or_keygen_required'
  | 'slug_invalid'
  | 'slug_taken'
  | 'tenant_invalid'

export class RegisterError extends Error {
  readonly code: RegisterErrorCode
  readonly detail?: Record<string, unknown>
  constructor(code: RegisterErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'RegisterError'
    this.code = code
    this.detail = detail
  }
}

export type Ed25519Jwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  alg?: string
}

export type Ed25519JwkPrivate = Ed25519Jwk & { d: string }

export type RegisterInput = {
  ownerHumanPrincipalId: string
  slug: string
  displayName?: string
  publicKeyJwk?: Ed25519Jwk
  generateKeypair?: boolean
  /** Slug of the tenant to grant. Resolved to a tenant row inside the service. */
  tenantSlug?: string
  metadata?: Record<string, unknown>
}

export type RegisterResult = {
  agent: AgentRow
  agentKey: AgentKeyRow
  /** Present when `generateKeypair` was true. Surfaced once. */
  privateKeyJwk?: Ed25519JwkPrivate
  /** Slug of the tenant the agent was granted. */
  tenantSlug: string
}

export type RegisterServiceDeps = {
  db: Db
  /** Mint agent principal id (`ag_<ULID>`). */
  mintAgentId: () => string
  /** Mint key id (`kid_<ULID>`). */
  mintKid: () => string
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
}

export type RegisterService = ReturnType<typeof createRegisterService>

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function decodeBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function encodeBase64Url(buf: Uint8Array): string {
  let bin = ''
  for (const b of buf) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function validateJwk(jwk: unknown): asserts jwk is Ed25519Jwk {
  if (!jwk || typeof jwk !== 'object') {
    throw new RegisterError('jwk_invalid', 'public_key_jwk must be an object')
  }
  const j = jwk as Record<string, unknown>
  if (j.kty !== 'OKP') throw new RegisterError('jwk_invalid', 'kty must be "OKP"')
  if (j.crv !== 'Ed25519') throw new RegisterError('jwk_invalid', 'crv must be "Ed25519"')
  if (typeof j.x !== 'string' || j.x.length === 0) {
    throw new RegisterError('jwk_invalid', 'x must be a base64url string')
  }
  const raw = decodeBase64Url(j.x)
  if (raw.length !== 32) throw new RegisterError('jwk_invalid', 'x must decode to 32 bytes')
}

async function generateEd25519(): Promise<{ publicJwk: Ed25519Jwk; privateJwk: Ed25519JwkPrivate }> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Ed25519Jwk
  const priv = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as Ed25519JwkPrivate
  return {
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: pub.x, alg: 'EdDSA' },
    privateJwk: { kty: 'OKP', crv: 'Ed25519', x: priv.x, d: priv.d, alg: 'EdDSA' },
  }
}

export const createRegisterService = (deps: RegisterServiceDeps) => {
  const now = deps.now ?? Date.now

  return {
    async register(input: RegisterInput): Promise<RegisterResult> {
      if (!SLUG_RE.test(input.slug)) {
        throw new RegisterError('slug_invalid', 'slug must match [a-z0-9-] up to 63 chars')
      }

      const wantsKeygen = input.generateKeypair === true
      const suppliedJwk = input.publicKeyJwk
      if (wantsKeygen && suppliedJwk) {
        throw new RegisterError(
          'jwk_or_keygen_required',
          'pass either public_key_jwk or generate_keypair, not both',
        )
      }
      if (!wantsKeygen && !suppliedJwk) {
        throw new RegisterError(
          'jwk_or_keygen_required',
          'one of public_key_jwk or generate_keypair=true is required',
        )
      }

      let publicJwk: Ed25519Jwk
      let privateJwk: Ed25519JwkPrivate | undefined
      if (wantsKeygen) {
        const generated = await generateEd25519()
        publicJwk = generated.publicJwk
        privateJwk = generated.privateJwk
      } else {
        validateJwk(suppliedJwk)
        publicJwk = suppliedJwk as Ed25519Jwk
      }

      const publicKeyBytes = decodeBase64Url(publicJwk.x)

      // Slug uniqueness.
      const existing = await deps.db
        .select()
        .from(agent)
        .where(eq(agent.slug, input.slug))
        .limit(1)
      if (existing[0]) {
        throw new RegisterError('slug_taken', 'slug already in use', { slug: input.slug })
      }

      // Resolve tenant slug → row. Unknown slug is a 422 (matches the
      // tenant_invalid error code; route maps to HTTP).
      const tenantSlug = input.tenantSlug ?? 'public'
      const tenantRows = await deps.db
        .select()
        .from(tenant)
        .where(eq(tenant.slug, tenantSlug))
        .limit(1)
      const tenantRow = tenantRows[0]
      if (!tenantRow) {
        throw new RegisterError('tenant_invalid', `unknown tenant: ${tenantSlug}`)
      }

      const tNow = new Date(now())
      const agentId = deps.mintAgentId()

      await deps.db.insert(principal).values({
        principalId: agentId,
        kind: 'agent',
      })
      const [agentRow] = await deps.db
        .insert(agent)
        .values({
          principalId: agentId,
          slug: input.slug,
          displayName: input.displayName ?? null,
          status: 'active',
          ownerHumanPrincipalId: input.ownerHumanPrincipalId,
          createdAt: tNow,
          updatedAt: tNow,
        })
        .returning()
      if (!agentRow) throw new Error('agent insert returned no row')

      const kid = deps.mintKid()
      const [keyRow] = await deps.db
        .insert(agentKey)
        .values({
          agentId,
          kid,
          publicKey: publicKeyBytes,
          algorithm: 'EdDSA',
          status: 'active',
          createdAt: tNow,
        })
        .returning()
      if (!keyRow) throw new Error('agent_key insert returned no row')

      // Grant tenant membership. Product policy is "one tenant per
      // agent at registration time"; we enforce that by writing
      // exactly one row here and never offering an "add membership"
      // surface on /v1/agent/me.
      await deps.db.insert(tenantPrincipalMembership).values({
        tenantId: tenantRow.tenantId,
        principalId: agentId,
        createdAt: tNow,
      })

      return {
        agent: agentRow,
        agentKey: keyRow,
        privateKeyJwk: privateJwk,
        tenantSlug: tenantRow.slug,
      }
    },
  }
}

// Re-exports for callers that build their own JWKs.
export { decodeBase64Url, encodeBase64Url }
