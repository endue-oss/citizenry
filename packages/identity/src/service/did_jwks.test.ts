import { describe, expect, it } from 'vitest'
import type { Db } from '../db'
import type { AgentKeyRow } from '../db/schema'
import type { AgentKeyRepo } from '../repo/agent_key'
import { createDidService } from './did'
import { createJwksService } from './jwks'

// ── fixtures ──────────────────────────────────────────

const noDb = null as unknown as Db

const sigBytes = new Uint8Array(32).fill(7)
const encBytes = new Uint8Array(32).fill(9)
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')

const sigRow: AgentKeyRow = {
  id: 1,
  agentId: 'ag_TEST',
  kid: 'kid_SIG',
  publicKey: sigBytes,
  algorithm: 'EdDSA',
  use: 'sig',
  boundToKid: null,
  status: 'active',
  createdAt: new Date(0),
  rotatedAt: null,
  revokedAt: null,
}

const encRow: AgentKeyRow = {
  ...sigRow,
  id: 2,
  kid: 'kid_ENC',
  publicKey: encBytes,
  algorithm: 'X25519',
  use: 'enc',
  boundToKid: 'kid_SIG',
}

const fakeKeys = (rows: { sig: AgentKeyRow[]; enc: AgentKeyRow[] }): AgentKeyRepo =>
  ({
    findActiveByAgent: async () => rows.sig,
    findActiveEncByAgent: async () => rows.enc,
    listValidByAgent: async () => rows.sig,
    listValidEncByAgent: async () => rows.enc,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

// ── did ───────────────────────────────────────────────

describe('createDidService.issuer', () => {
  it('builds the instance document from the configured issuer host', async () => {
    const did = createDidService({ db: noDb, issuerHost: 'id.example.test' })
    const doc = await did.issuer()
    expect(doc.id).toBe('did:web:id.example.test')
    expect(doc.verificationMethod).toEqual([])
    expect(doc.authentication).toEqual([])
    expect(doc.assertionMethod).toEqual([])
    expect(doc.keyAgreement).toEqual([])
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1')
  })
})

describe('createDidService.agent', () => {
  it('publishes active sig + enc keys as verification methods', async () => {
    const did = createDidService({
      db: noDb,
      issuerHost: 'id.example.test',
      keys: fakeKeys({ sig: [sigRow], enc: [encRow] }),
    })
    const doc = await did.agent('ag_TEST')

    expect(doc.id).toBe('did:web:id.example.test:agent:ag_TEST')
    expect(doc.verificationMethod).toHaveLength(2)
    expect(doc.verificationMethod[0]).toMatchObject({
      id: 'did:web:id.example.test:agent:ag_TEST#kid_SIG',
      controller: 'did:web:id.example.test:agent:ag_TEST',
      publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', use: 'sig', x: b64u(sigBytes) },
    })
    expect(doc.authentication).toEqual(['did:web:id.example.test:agent:ag_TEST#kid_SIG'])
    expect(doc.keyAgreement).toEqual(['did:web:id.example.test:agent:ag_TEST#kid_ENC'])
  })

  it('yields a method-less document for an unknown agent', async () => {
    const did = createDidService({
      db: noDb,
      issuerHost: 'id.example.test',
      keys: fakeKeys({ sig: [], enc: [] }),
    })
    const doc = await did.agent('ag_GHOST')
    expect(doc.id).toBe('did:web:id.example.test:agent:ag_GHOST')
    expect(doc.verificationMethod).toEqual([])
  })
})

// ── jwks ──────────────────────────────────────────────

describe('createJwksService.agent', () => {
  it('publishes valid sig + enc keys with base64url x', async () => {
    const jwks = createJwksService({
      db: noDb,
      keys: fakeKeys({ sig: [sigRow], enc: [encRow] }),
    })
    const set = await jwks.agent('ag_TEST')
    expect(set.keys).toHaveLength(2)
    expect(set.keys[0]).toEqual({
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
      x: b64u(sigBytes),
      kid: 'kid_SIG',
    })
    expect(set.keys[1]).toEqual({
      kty: 'OKP',
      crv: 'X25519',
      use: 'enc',
      x: b64u(encBytes),
      kid: 'kid_ENC',
    })
  })

  it('returns an empty set for an unknown agent', async () => {
    const jwks = createJwksService({ db: noDb, keys: fakeKeys({ sig: [], enc: [] }) })
    await expect(jwks.agent('ag_GHOST')).resolves.toEqual({ keys: [] })
  })
})
