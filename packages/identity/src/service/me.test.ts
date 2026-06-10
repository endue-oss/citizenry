import { describe, expect, it } from 'vitest'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import { AuthError, ROTATED_KEY_GRACE_SEC } from '../auth'
import type { Db } from '../db'
import type { AgentRow, AgentKeyRow } from '../db/schema'
import { createMeService, type MeServicePorts } from './me'
import type { TokenServicePorts } from './token'

// ── helpers ───────────────────────────────────────────

const NOW_MS = 1_770_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)
const AUDIENCE = ['api.example.test']

const td = new TextEncoder()
const b64u = (buf: ArrayBuffer | Uint8Array): string =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url')

type Signer = { priv: CryptoKey; publicKey: Uint8Array; x: string }

async function freshSigner(): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { x: string }
  return {
    priv: pair.privateKey,
    publicKey: new Uint8Array(Buffer.from(jwk.x, 'base64url')),
    x: jwk.x,
  }
}

async function signBodyJws(
  signer: Signer,
  action: 'rotate-key' | 'revoke',
  inner: unknown,
  jti: string,
): Promise<string> {
  const header = { alg: 'EdDSA', kid: 'kid_OLD' }
  const payload = {
    sub: 'ag_TEST',
    iss: 'ag_TEST',
    aud: 'api.example.test',
    iat: NOW_SEC - 5,
    exp: NOW_SEC + 120,
    jti,
    action,
    payload: inner,
  }
  const h64 = b64u(td.encode(JSON.stringify(header)))
  const p64 = b64u(td.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('Ed25519', signer.priv, td.encode(`${h64}.${p64}`))
  return `${h64}.${p64}.${b64u(sig)}`
}

const keyRow = (signer: Signer, over: Partial<AgentKeyRow> = {}): AgentKeyRow => ({
  id: 1,
  agentId: 'ag_TEST',
  kid: 'kid_OLD',
  publicKey: signer.publicKey,
  algorithm: 'EdDSA',
  use: 'sig',
  boundToKid: null,
  status: 'active',
  createdAt: new Date(NOW_MS - 60_000),
  rotatedAt: null,
  revokedAt: null,
  ...over,
})

const agentRow = (over: Partial<AgentRow> = {}): AgentRow => ({
  principalId: 'ag_TEST',
  slug: 'tester',
  displayName: 'Tester',
  status: 'active',
  ownerHumanPrincipalId: 'hu_OWNER',
  createdAt: new Date(NOW_MS - 120_000),
  updatedAt: new Date(NOW_MS - 120_000),
  ...over,
})

type Recorded = {
  ops: string[]
  inserted: Array<{ agentId: string; kid: string; publicKey: Uint8Array; createdAt: Date }>
  rotated: Array<{ kid: string; rotatedAt: Date }>
  revoked: Array<{ agentId: string; revokedAt: Date }>
}

function fakeMePorts(state: {
  agent?: AgentRow
  sigKey?: AgentKeyRow
  tenantSlug?: string
}): { ports: MeServicePorts; rec: Recorded } {
  const rec: Recorded = { ops: [], inserted: [], rotated: [], revoked: [] }
  const ports: MeServicePorts = {
    findAgentById: async (id) =>
      state.agent && state.agent.principalId === id ? state.agent : undefined,
    findActiveSigKeyByAgent: async () => state.sigKey,
    findTenantSlugByPrincipal: async () => state.tenantSlug,
    insertSigKey: async (input) => {
      rec.ops.push('insert')
      rec.inserted.push(input)
    },
    markRotated: async (kid, rotatedAt) => {
      rec.ops.push('rotate')
      rec.rotated.push({ kid, rotatedAt })
    },
    revokeAgent: async (agentId, revokedAt) => {
      rec.ops.push('revoke')
      rec.revoked.push({ agentId, revokedAt })
    },
  }
  return { ports, rec }
}

function fakeTokenPorts(signer: Signer, agent: AgentRow): TokenServicePorts {
  const key = keyRow(signer)
  const claimed = new Set<string>()
  return {
    findSigKeyByKid: async (kid) => (kid === key.kid ? key : undefined),
    findAgentById: async (id) => (id === agent.principalId ? agent : undefined),
    claimJti: async (jti) => {
      if (claimed.has(jti)) return false
      claimed.add(jti)
      return true
    },
  }
}

const noDb = null as unknown as Db

function buildSvc(opts: {
  signer: Signer
  agent?: AgentRow
  sigKey?: AgentKeyRow
  tenantSlug?: string
}) {
  const agent = opts.agent ?? agentRow()
  const { ports, rec } = fakeMePorts({
    agent,
    sigKey: opts.sigKey,
    tenantSlug: opts.tenantSlug,
  })
  let n = 0
  const svc = createMeService({
    db: noDb,
    audience: AUDIENCE,
    mintKid: () => `kid_NEW${++n}`,
    now: () => NOW_MS,
    ports,
    tokenPorts: fakeTokenPorts(opts.signer, agent),
  })
  return { svc, rec }
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AuthError)
  expect((err as AuthError).code).toBe(code)
}

// ── whoami ────────────────────────────────────────────

describe('createMeService.whoami', () => {
  it('returns the agent, active key, and tenant slug', async () => {
    const signer = await freshSigner()
    const { svc } = buildSvc({
      signer,
      sigKey: keyRow(signer),
      tenantSlug: 'public',
    })
    const who = await svc.whoami('ag_TEST')
    expect(who.agent.slug).toBe('tester')
    expect(who.sigKey.kid).toBe('kid_OLD')
    expect(who.tenantSlug).toBe('public')
  })

  it('404s on an unknown agent', async () => {
    const signer = await freshSigner()
    const { svc } = buildSvc({ signer, sigKey: keyRow(signer), tenantSlug: 'public' })
    await expectCode(svc.whoami('ag_NOPE'), IDENTITY_ERR.not_found)
  })

  it('fails loudly when the tenant membership is missing', async () => {
    const signer = await freshSigner()
    const { svc } = buildSvc({ signer, sigKey: keyRow(signer) })
    await expectCode(svc.whoami('ag_TEST'), IDENTITY_ERR.internal)
  })
})

// ── rotateKey ─────────────────────────────────────────

describe('createMeService.rotateKey', () => {
  it('inserts the new key, then marks the old key rotated', async () => {
    const signer = await freshSigner()
    const next = await freshSigner()
    const { svc, rec } = buildSvc({ signer })
    const jws = await signBodyJws(
      signer,
      'rotate-key',
      { new_public_key_jwk: { kty: 'OKP', crv: 'Ed25519', x: next.x } },
      'jti-rot-1',
    )

    const out = await svc.rotateKey(jws)

    expect(out.prevKid).toBe('kid_OLD')
    expect(out.newKid).toBe('kid_NEW1')
    expect(out.rotatedUntil.getTime()).toBe(NOW_MS + ROTATED_KEY_GRACE_SEC * 1000)

    expect(rec.ops).toEqual(['insert', 'rotate'])
    expect(rec.inserted[0]?.kid).toBe('kid_NEW1')
    expect(rec.inserted[0]?.agentId).toBe('ag_TEST')
    expect(Buffer.from(rec.inserted[0]!.publicKey).toString('base64url')).toBe(next.x)
    expect(rec.rotated[0]?.kid).toBe('kid_OLD')
  })

  it('rejects a new JWK that carries a kid', async () => {
    const signer = await freshSigner()
    const next = await freshSigner()
    const { svc, rec } = buildSvc({ signer })
    const jws = await signBodyJws(
      signer,
      'rotate-key',
      { new_public_key_jwk: { kty: 'OKP', crv: 'Ed25519', x: next.x, kid: 'kid_EVIL' } },
      'jti-rot-2',
    )
    await expectCode(svc.rotateKey(jws), IDENTITY_ERR.jwk_invalid)
    expect(rec.ops).toEqual([])
  })

  it('rejects a non-Ed25519 JWK', async () => {
    const signer = await freshSigner()
    const next = await freshSigner()
    const { svc } = buildSvc({ signer })
    const jws = await signBodyJws(
      signer,
      'rotate-key',
      { new_public_key_jwk: { kty: 'OKP', crv: 'X25519', x: next.x } },
      'jti-rot-3',
    )
    await expectCode(svc.rotateKey(jws), IDENTITY_ERR.jwk_invalid)
  })

  it('rejects a missing new_public_key_jwk', async () => {
    const signer = await freshSigner()
    const { svc } = buildSvc({ signer })
    const jws = await signBodyJws(signer, 'rotate-key', {}, 'jti-rot-4')
    await expectCode(svc.rotateKey(jws), IDENTITY_ERR.jwk_invalid)
  })

  it('rejects an x that does not decode to 32 bytes', async () => {
    const signer = await freshSigner()
    const { svc } = buildSvc({ signer })
    const jws = await signBodyJws(
      signer,
      'rotate-key',
      { new_public_key_jwk: { kty: 'OKP', crv: 'Ed25519', x: b64u(new Uint8Array(31)) } },
      'jti-rot-5',
    )
    await expectCode(svc.rotateKey(jws), IDENTITY_ERR.jwk_invalid)
  })
})

// ── selfRevoke ────────────────────────────────────────

describe('createMeService.selfRevoke', () => {
  it('revokes the agent and its keys', async () => {
    const signer = await freshSigner()
    const { svc, rec } = buildSvc({ signer })
    const jws = await signBodyJws(signer, 'revoke', {}, 'jti-rev-1')

    await svc.selfRevoke(jws)

    expect(rec.revoked).toEqual([{ agentId: 'ag_TEST', revokedAt: new Date(NOW_MS) }])
  })

  it('rejects a rotate-key JWS presented to revoke', async () => {
    const signer = await freshSigner()
    const { svc, rec } = buildSvc({ signer })
    const jws = await signBodyJws(signer, 'rotate-key', {}, 'jti-rev-2')
    await expectCode(svc.selfRevoke(jws), IDENTITY_ERR.jws_action_mismatch)
    expect(rec.revoked).toEqual([])
  })
})
