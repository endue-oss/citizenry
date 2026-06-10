import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import { AuthError } from '../auth'
import type { Db } from '../db'
import type { AgentRow, AgentKeyRow } from '../db/schema'
import type { MeService } from '../service/me'
import type { JwksService } from '../service/jwks'
import type { DidService, DidDocument } from '../service/did'
import { identityRouter, type IdentityRouterVars } from './index'

// ── fakes ─────────────────────────────────────────────
// Router tests only care about request parsing, status codes, and
// envelope shape — the service layer has its own unit tests.

const NOW_MS = 1_770_000_000_000
const keyBytes = new Uint8Array(32).fill(5)

const agent: AgentRow = {
  principalId: 'ag_TEST',
  slug: 'tester',
  displayName: 'Tester',
  status: 'active',
  ownerHumanPrincipalId: 'hu_OWNER',
  createdAt: new Date(NOW_MS - 120_000),
  updatedAt: new Date(NOW_MS - 60_000),
}

const sigKey: AgentKeyRow = {
  id: 1,
  agentId: 'ag_TEST',
  kid: 'kid_SIG',
  publicKey: keyBytes,
  algorithm: 'EdDSA',
  use: 'sig',
  boundToKid: null,
  status: 'active',
  createdAt: new Date(NOW_MS - 120_000),
  rotatedAt: null,
  revokedAt: null,
}

const issuerDoc: DidDocument = {
  '@context': ['https://www.w3.org/ns/did/v1'],
  id: 'did:web:id.example.test',
  verificationMethod: [],
  authentication: [],
  assertionMethod: [],
  keyAgreement: [],
}

function fakeMe(overrides: Partial<MeService> = {}): MeService {
  return {
    whoami: async () => ({ agent, sigKey, tenantSlug: 'public' }),
    rotateKey: async () => ({
      prevKid: 'kid_SIG',
      newKid: 'kid_NEW',
      rotatedUntil: new Date(NOW_MS + 1000),
    }),
    selfRevoke: async () => undefined,
    ...overrides,
  }
}

const fakeJwks: JwksService = {
  agent: async (id: string) => ({
    keys: [{ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig', x: `x-${id}`, kid: 'kid_SIG' }],
  }),
}

const fakeDid: DidService = {
  issuer: async () => issuerDoc,
  agent: async (id: string) => ({ ...issuerDoc, id: `did:web:id.example.test:agent:${id}` }),
  issuerId: () => 'did:web:id.example.test',
}

function app(opts: { me?: MeService; withJwt?: boolean } = {}) {
  return new Hono<{ Variables: IdentityRouterVars }>()
    .use('*', async (c, next) => {
      c.set('db', null as unknown as Db)
      c.set('issuerHost', 'id.example.test')
      c.set('audience', ['api.example.test'])
      c.set('mintKid', () => 'kid_X')
      c.set('me', opts.me ?? fakeMe())
      c.set('jwks', fakeJwks)
      c.set('did', fakeDid)
      if (opts.withJwt) {
        c.set('agentJwtPayload', {
          sub: 'ag_TEST',
          iss: 'ag_TEST',
          aud: 'api.example.test',
          iat: 0,
          exp: 0,
          kid: 'kid_SIG',
        })
      }
      await next()
    })
    .route('/', identityRouter)
}

// ── GET /v1/agent/me ──────────────────────────────────

describe('GET /v1/agent/me', () => {
  it('401s without a verified bearer payload', async () => {
    const res = await app().request('/v1/agent/me')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string; title: string }
    expect(body.code).toBe(IDENTITY_ERR.unauthorized)
    expect(body.title).toBe('Unauthorized')
  })

  it('returns the spec response shape', async () => {
    const res = await app({ withJwt: true }).request('/v1/agent/me')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      id: 'ag_TEST',
      slug: 'tester',
      display_name: 'Tester',
      public_key_b64: Buffer.from(keyBytes).toString('base64url'),
      status: 'active',
      tenant: 'public',
      did: 'did:web:id.example.test:agent:ag_TEST',
      owner_human_principal_id: 'hu_OWNER',
    })
    expect(typeof body.created_at).toBe('string')
    expect(typeof body.updated_at).toBe('string')
  })

  it('maps service AuthErrors onto the catalog status', async () => {
    const me = fakeMe({
      whoami: async () => {
        throw new AuthError(IDENTITY_ERR.not_found, 'agent not found')
      },
    })
    const res = await app({ me, withJwt: true }).request('/v1/agent/me')
    expect(res.status).toBe(404)
  })
})

// ── POST /v1/agent/me/rotate-key ──────────────────────

describe('POST /v1/agent/me/rotate-key', () => {
  const post = (body: BodyInit | null, me?: MeService) =>
    app({ me }).request('/v1/agent/me/rotate-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })

  it('400s on a non-JSON body', async () => {
    const res = await post('not json')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe(IDENTITY_ERR.bad_request)
  })

  it('400s when jws is missing', async () => {
    const res = await post(JSON.stringify({}))
    expect(res.status).toBe(400)
  })

  it('returns prev/new kid and the grace deadline', async () => {
    const res = await post(JSON.stringify({ jws: 'a.b.c' }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.prev_kid).toBe('kid_SIG')
    expect(body.new_kid).toBe('kid_NEW')
    expect(body.rotated_until).toBe(new Date(NOW_MS + 1000).toISOString())
  })

  it('409s when the signing key is not active', async () => {
    const me = fakeMe({
      rotateKey: async () => {
        throw new AuthError(IDENTITY_ERR.key_not_active, 'signing key is not active')
      },
    })
    const res = await post(JSON.stringify({ jws: 'a.b.c' }), me)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { title: string; code: string }
    expect(body.title).toBe('Conflict')
    expect(body.code).toBe(IDENTITY_ERR.key_not_active)
  })

  it('401s on a jti replay', async () => {
    const me = fakeMe({
      rotateKey: async () => {
        throw new AuthError(IDENTITY_ERR.jws_replay, 'jti already used')
      },
    })
    const res = await post(JSON.stringify({ jws: 'a.b.c' }), me)
    expect(res.status).toBe(401)
  })
})

// ── DELETE /v1/agent/me ───────────────────────────────

describe('DELETE /v1/agent/me', () => {
  it('204s on success', async () => {
    const res = await app().request('/v1/agent/me', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jws: 'a.b.c' }),
    })
    expect(res.status).toBe(204)
  })

  it('400s when the body is not JSON', async () => {
    const res = await app().request('/v1/agent/me', { method: 'DELETE', body: 'nope' })
    expect(res.status).toBe(400)
  })
})

// ── public discovery routes ───────────────────────────

describe('well-known + per-agent discovery', () => {
  it('keeps the instance JWKS empty until federation keys ship', async () => {
    const res = await app().request('/.well-known/jwks.json')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ keys: [] })
  })

  it('serves the issuer DID document from the service', async () => {
    const res = await app().request('/.well-known/did.json')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string }
    expect(body.id).toBe('did:web:id.example.test')
  })

  it('serves the per-agent JWKS', async () => {
    const res = await app().request('/agent/ag_42/jwks.json')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { keys: Array<{ x: string }> }
    expect(body.keys[0]?.x).toBe('x-ag_42')
  })

  it('serves the per-agent DID document', async () => {
    const res = await app().request('/agent/ag_42/did.json')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string }
    expect(body.id).toBe('did:web:id.example.test:agent:ag_42')
  })
})
