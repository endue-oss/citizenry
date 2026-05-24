// Agent registration. The caller authenticates with their human
// API-Key (`chk_…`), the router resolves the owner human, and this
// service mints a fresh agent + a dual key set under that owner:
//
//   - a signing key  (Ed25519 / EdDSA, use='sig') — identity + JWT
//   - an encryption key (X25519, use='enc')       — vault encrypt-to-agent
//
// Flow:
//   1. Validate the keying request. Exactly one path:
//        a. client-supplied: public_key_jwk + encryption_key_jwk +
//           key_binding_jws (the sig key signs over both public keys).
//        b. generate_keypair=true: the server mints both keypairs and
//           surfaces both private JWKs once.
//   2. Verify the binding JWS (path a) — proves the holder of the sig
//      private key vouches for the enc key, and proves possession of
//      the Ed25519 private key (closes the registration PoP gap).
//   3. Slug uniqueness + tenant resolution.
//   4. Insert principal (kind='agent') + agent + two agent_key rows
//      (sig active, enc active bound_to_kid=sigKid).
//   5. Return everything; raw private JWKs are surfaced once on the
//      server-keygen path.

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
  | 'enc_jwk_invalid'
  | 'binding_invalid'
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

export type X25519Jwk = {
  kty: 'OKP'
  crv: 'X25519'
  x: string
}

export type X25519JwkPrivate = X25519Jwk & { d: string }

export type RegisterInput = {
  ownerHumanPrincipalId: string
  slug: string
  displayName?: string
  /** Client-supplied Ed25519 signing public key. Pairs with encryptionPublicKeyJwk + keyBindingJws. */
  publicKeyJwk?: Ed25519Jwk
  /** Client-supplied X25519 encryption public key. */
  encryptionPublicKeyJwk?: X25519Jwk
  /** Compact JWS (EdDSA) binding the enc key to the sig identity. Required on the client path. */
  keyBindingJws?: string
  /** When true, the server generates both keypairs and returns the private JWKs once. */
  generateKeypair?: boolean
  /** Slug of the tenant to grant. Resolved to a tenant row inside the service. */
  tenantSlug?: string
  metadata?: Record<string, unknown>
}

export type RegisterResult = {
  agent: AgentRow
  /** The signing key row (use='sig'). */
  agentKey: AgentKeyRow
  /** The encryption key row (use='enc'). */
  encryptionKey: AgentKeyRow
  /** Present when `generateKeypair` was true. Surfaced once. */
  privateKeyJwk?: Ed25519JwkPrivate
  /** Present when `generateKeypair` was true. Surfaced once. */
  encryptionPrivateKeyJwk?: X25519JwkPrivate
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

function decodeBase64UrlToString(s: string): string {
  return new TextDecoder().decode(decodeBase64Url(s))
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

function validateX25519Jwk(jwk: unknown): asserts jwk is X25519Jwk {
  if (!jwk || typeof jwk !== 'object') {
    throw new RegisterError('enc_jwk_invalid', 'encryption_key_jwk must be an object')
  }
  const j = jwk as Record<string, unknown>
  if (j.kty !== 'OKP') throw new RegisterError('enc_jwk_invalid', 'kty must be "OKP"')
  if (j.crv !== 'X25519') throw new RegisterError('enc_jwk_invalid', 'crv must be "X25519"')
  if (typeof j.x !== 'string' || j.x.length === 0) {
    throw new RegisterError('enc_jwk_invalid', 'x must be a base64url string')
  }
  const raw = decodeBase64Url(j.x)
  if (raw.length !== 32) throw new RegisterError('enc_jwk_invalid', 'x must decode to 32 bytes')
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

async function generateX25519(): Promise<{ publicJwk: X25519Jwk; privateJwk: X25519JwkPrivate }> {
  const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as X25519Jwk
  const priv = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as X25519JwkPrivate
  return {
    publicJwk: { kty: 'OKP', crv: 'X25519', x: pub.x },
    privateJwk: { kty: 'OKP', crv: 'X25519', x: priv.x, d: priv.d },
  }
}

type BindingPayload = {
  purpose?: string
  sig_jwk?: { x?: string }
  enc_jwk?: { x?: string }
  slug?: string
  iat?: number
  exp?: number
}

/**
 * Verify the key-binding JWS that ties an X25519 enc key to the Ed25519
 * sig identity. The JWS is signed by the sig private key; verifying it
 * proves possession of that key and the holder's assertion that the enc
 * key is theirs.
 *
 * Checks: alg=EdDSA, Ed25519 signature over `header.payload` using
 * sig_jwk.x, sig_jwk.x === supplied sig key, enc_jwk.x === supplied enc
 * key, slug matches, exp in the future.
 */
async function verifyBindingJws(
  jws: string,
  expect: { sigX: string; encX: string; slug: string; now: number },
): Promise<void> {
  const parts = jws.split('.')
  if (parts.length !== 3) {
    throw new RegisterError('binding_invalid', 'key_binding_jws must be a compact JWS')
  }
  const [h64, p64, s64] = parts as [string, string, string]

  let header: { alg?: string; typ?: string }
  let payload: BindingPayload
  try {
    header = JSON.parse(decodeBase64UrlToString(h64))
    payload = JSON.parse(decodeBase64UrlToString(p64))
  } catch {
    throw new RegisterError('binding_invalid', 'binding header/payload not valid JSON')
  }

  if (header.alg !== 'EdDSA') {
    throw new RegisterError('binding_invalid', 'binding alg must be EdDSA')
  }
  if (payload.purpose !== 'key-binding') {
    throw new RegisterError('binding_invalid', 'binding purpose must be "key-binding"')
  }
  if (payload.sig_jwk?.x !== expect.sigX) {
    throw new RegisterError('binding_invalid', 'binding sig_jwk does not match public_key_jwk')
  }
  if (payload.enc_jwk?.x !== expect.encX) {
    throw new RegisterError('binding_invalid', 'binding enc_jwk does not match encryption_key_jwk')
  }
  if (payload.slug !== expect.slug) {
    throw new RegisterError('binding_invalid', 'binding slug does not match request slug')
  }
  if (typeof payload.exp !== 'number' || payload.exp <= expect.now) {
    throw new RegisterError('binding_invalid', 'binding expired or missing exp')
  }

  // Verify the Ed25519 signature against the sig public key the binding
  // claims (and which we already cross-checked equals public_key_jwk).
  const signingInput = new TextEncoder().encode(`${h64}.${p64}`)
  const signature = decodeBase64Url(s64)
  let publicKey: CryptoKey
  try {
    publicKey = await crypto.subtle.importKey(
      'raw',
      decodeBase64Url(expect.sigX),
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
  } catch {
    throw new RegisterError('binding_invalid', 'sig key is not a valid Ed25519 public key')
  }
  const ok = await crypto.subtle.verify('Ed25519', publicKey, signature, signingInput)
  if (!ok) {
    throw new RegisterError('binding_invalid', 'binding signature verification failed')
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
      const suppliedSig = input.publicKeyJwk
      const suppliedEnc = input.encryptionPublicKeyJwk
      if (wantsKeygen && (suppliedSig || suppliedEnc)) {
        throw new RegisterError(
          'jwk_or_keygen_required',
          'pass either the public-key JWKs or generate_keypair, not both',
        )
      }
      if (!wantsKeygen && !suppliedSig) {
        throw new RegisterError(
          'jwk_or_keygen_required',
          'one of public_key_jwk or generate_keypair=true is required',
        )
      }

      let sigPublicJwk: Ed25519Jwk
      let sigPrivateJwk: Ed25519JwkPrivate | undefined
      let encPublicJwk: X25519Jwk
      let encPrivateJwk: X25519JwkPrivate | undefined

      if (wantsKeygen) {
        const sig = await generateEd25519()
        const enc = await generateX25519()
        sigPublicJwk = sig.publicJwk
        sigPrivateJwk = sig.privateJwk
        encPublicJwk = enc.publicJwk
        encPrivateJwk = enc.privateJwk
      } else {
        validateJwk(suppliedSig)
        if (!suppliedEnc) {
          throw new RegisterError(
            'enc_jwk_invalid',
            'encryption_key_jwk is required alongside public_key_jwk',
          )
        }
        validateX25519Jwk(suppliedEnc)
        if (!input.keyBindingJws) {
          throw new RegisterError(
            'binding_invalid',
            'key_binding_jws is required when supplying keys',
          )
        }
        await verifyBindingJws(input.keyBindingJws, {
          sigX: (suppliedSig as Ed25519Jwk).x,
          encX: suppliedEnc.x,
          slug: input.slug,
          now: Math.floor(now() / 1000),
        })
        sigPublicJwk = suppliedSig as Ed25519Jwk
        encPublicJwk = suppliedEnc
      }

      const sigPublicKeyBytes = decodeBase64Url(sigPublicJwk.x)
      const encPublicKeyBytes = decodeBase64Url(encPublicJwk.x)

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

      // Signing key (use='sig').
      const sigKid = deps.mintKid()
      const [sigKeyRow] = await deps.db
        .insert(agentKey)
        .values({
          agentId,
          kid: sigKid,
          publicKey: sigPublicKeyBytes,
          algorithm: 'EdDSA',
          use: 'sig',
          status: 'active',
          createdAt: tNow,
        })
        .returning()
      if (!sigKeyRow) throw new Error('agent_key (sig) insert returned no row')

      // Encryption key (use='enc'), vouched for by the sig key.
      const encKid = deps.mintKid()
      const [encKeyRow] = await deps.db
        .insert(agentKey)
        .values({
          agentId,
          kid: encKid,
          publicKey: encPublicKeyBytes,
          algorithm: 'X25519',
          use: 'enc',
          boundToKid: sigKid,
          status: 'active',
          createdAt: tNow,
        })
        .returning()
      if (!encKeyRow) throw new Error('agent_key (enc) insert returned no row')

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
        agentKey: sigKeyRow,
        encryptionKey: encKeyRow,
        privateKeyJwk: sigPrivateJwk,
        encryptionPrivateKeyJwk: encPrivateJwk,
        tenantSlug: tenantRow.slug,
      }
    },
  }
}

// Re-exports for callers that build their own JWKs.
export { decodeBase64Url, encodeBase64Url }

// Exported for unit testing the security-critical binding check.
export { verifyBindingJws }
