import { describe, expect, it } from 'vitest'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import { AuthError } from '../auth'
import type { Db } from '../db'
import type { AgentRow, AgentKeyRow } from '../db/schema'
import {
  createTokenService,
  MAX_BODY_JWS_LIFETIME_SEC,
  type BodyJwsAction,
  type TokenServicePorts,
} from './token'

// ── helpers ───────────────────────────────────────────

const NOW_MS = 1_770_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)
const AUDIENCE = ['api.example.test', 'citizenry-id']

const td = new TextEncoder()
const b64u = (buf: ArrayBuffer | Uint8Array): string =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url')

type Signer = { priv: CryptoKey; publicKey: Uint8Array }

async function freshSigner(): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { x: string }
  return { priv: pair.privateKey, publicKey: new Uint8Array(Buffer.from(jwk.x, 'base64url')) }
}

async function signBodyJws(
  signer: Signer,
  opts: {
    kid?: string
    alg?: string
    sub?: string
    iss?: string
    aud?: string | string[]
    iat?: number
    exp?: number
    jti?: string | undefined
    action?: string
    inner?: unknown
    badSig?: boolean
  } = {},
): Promise<string> {
  const header = { alg: opts.alg ?? 'EdDSA', kid: opts.kid ?? 'kid_OLD' }
  const payload: Record<string, unknown> = {
    sub: opts.sub ?? 'ag_TEST',
    iss: opts.iss ?? opts.sub ?? 'ag_TEST',
    aud: opts.aud ?? 'api.example.test',
    iat: opts.iat ?? NOW_SEC - 5,
    exp: opts.exp ?? NOW_SEC + 120,
    action: opts.action ?? 'rotate-key',
    payload: opts.inner ?? {},
  }
  if (opts.jti !== undefined || !('jti' in opts)) payload.jti = opts.jti ?? 'jti-1'
  const h64 = b64u(td.encode(JSON.stringify(header)))
  const p64 = b64u(td.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('Ed25519', signer.priv, td.encode(`${h64}.${p64}`))
  const s64 = opts.badSig ? b64u(new Uint8Array(64)) : b64u(sig)
  return `${h64}.${p64}.${s64}`
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
  displayName: null,
  status: 'active',
  ownerHumanPrincipalId: 'hu_OWNER',
  createdAt: new Date(NOW_MS - 120_000),
  updatedAt: new Date(NOW_MS - 120_000),
  ...over,
})

function fakePorts(state: { key?: AgentKeyRow; agent?: AgentRow }) {
  const claimed = new Set<string>()
  const ports: TokenServicePorts = {
    findSigKeyByKid: async (kid) =>
      state.key && state.key.kid === kid ? state.key : undefined,
    findAgentById: async (id) =>
      state.agent && state.agent.principalId === id ? state.agent : undefined,
    claimJti: async (jti) => {
      if (claimed.has(jti)) return false
      claimed.add(jti)
      return true
    },
  }
  return { ports, claimed }
}

const noDb = null as unknown as Db

function svc(ports: TokenServicePorts) {
  return createTokenService({ db: noDb, audience: AUDIENCE, now: () => NOW_MS, ports })
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AuthError)
  expect((err as AuthError).code).toBe(code)
}

const ACTION: BodyJwsAction = 'rotate-key'

// ── verifyBodyJws ─────────────────────────────────────

describe('createTokenService.verifyBodyJws', () => {
  it('accepts a valid body JWS and claims the jti', async () => {
    const signer = await freshSigner()
    const { ports, claimed } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { inner: { hello: 'world' } })

    const out = await svc(ports).verifyBodyJws(jws, ACTION)

    expect(out.payload.sub).toBe('ag_TEST')
    expect(out.payload.action).toBe('rotate-key')
    expect(out.payload.jti).toBe('jti-1')
    expect(out.payload.payload).toEqual({ hello: 'world' })
    expect(out.key.kid).toBe('kid_OLD')
    expect(out.agent.principalId).toBe('ag_TEST')
    expect(claimed.has('jti-1')).toBe(true)
  })

  it('rejects a malformed compact JWS', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    await expectCode(svc(ports).verifyBodyJws('not-a-jws', ACTION), IDENTITY_ERR.unauthorized)
  })

  it('rejects a non-EdDSA alg', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { alg: 'ES256' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jwt_alg_mismatch)
  })

  it('rejects an unknown kid', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { kid: 'kid_NOPE' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jwt_kid_unknown)
  })

  it('rejects a rotated signing key (key_not_active)', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({
      key: keyRow(signer, { status: 'rotated', rotatedAt: new Date(NOW_MS - 1000) }),
      agent: agentRow(),
    })
    const jws = await signBodyJws(signer)
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.key_not_active)
  })

  it('rejects an action mismatch', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { action: 'revoke' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jws_action_mismatch)
  })

  it('rejects an audience mismatch', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { aud: 'api.other.example' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jwt_aud_mismatch)
  })

  it('rejects sub that does not match the key owner', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { sub: 'ag_OTHER' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.unauthorized)
  })

  it('rejects an exp past the clock-skew leeway, accepts within it', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })

    const expired = await signBodyJws(signer, { exp: NOW_SEC - 120, iat: NOW_SEC - 180 })
    await expectCode(svc(ports).verifyBodyJws(expired, ACTION), IDENTITY_ERR.jwt_expired)

    const { ports: ports2 } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const justExpired = await signBodyJws(signer, { exp: NOW_SEC - 30, iat: NOW_SEC - 90 })
    await expect(svc(ports2).verifyBodyJws(justExpired, ACTION)).resolves.toBeTruthy()
  })

  it('rejects a lifetime beyond the maximum', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const exp = NOW_SEC + 60
    const jws = await signBodyJws(signer, {
      exp,
      iat: exp - (MAX_BODY_JWS_LIFETIME_SEC + 1),
    })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jws_lifetime_exceeded)
  })

  it('rejects a missing jti', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { jti: '' })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.unauthorized)
  })

  it('rejects a jti replay on the second use', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer)
    await expect(svc(ports).verifyBodyJws(jws, ACTION)).resolves.toBeTruthy()
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.jws_replay)
  })

  it('rejects a bad signature without burning the jti', async () => {
    const signer = await freshSigner()
    const { ports, claimed } = fakePorts({ key: keyRow(signer), agent: agentRow() })
    const jws = await signBodyJws(signer, { badSig: true })
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.unauthorized)
    expect(claimed.size).toBe(0)
  })

  it('rejects a revoked agent (agent_revoked)', async () => {
    const signer = await freshSigner()
    const { ports } = fakePorts({
      key: keyRow(signer),
      agent: agentRow({ status: 'revoked' }),
    })
    const jws = await signBodyJws(signer)
    await expectCode(svc(ports).verifyBodyJws(jws, ACTION), IDENTITY_ERR.agent_revoked)
  })
})
