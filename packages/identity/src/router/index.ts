import { Hono } from 'hono'
import type { Db } from '../db'
import {
  mountPublicFederationRoutes,
  type FederationVars,
} from './federation'

type Vars = { db: Db } & Partial<FederationVars>

/**
 * User-facing identity router.
 *
 * Routes (mirror the reference spec — exposed as-is when mounted at root):
 *   POST   /api/v1/agent/register      (Bearer enrollment token)
 *   GET    /api/v1/agent/me            (Bearer self-signed JWT)
 *   POST   /api/v1/agent/me/rotate-key (body JWS, old key signed)
 *   DELETE /api/v1/agent/me            (body JWS, current key signed)
 *   GET    /.well-known/jwks.json      (public, no auth)
 *   GET    /.well-known/did.json       (public, no auth)
 *   GET    /agent/:id/jwks.json        (public, no auth)
 *   GET    /agent/:id/did.json         (public, no auth)
 */
export const identityRouter = new Hono<{ Variables: Vars }>()
  // ── Register ──────────────────────────────────────────
  .post('/api/v1/agent/register', (c) => c.json({ todo: 'register' }, 201))

  // ── /me self-service ─────────────────────────────────
  .get('/api/v1/agent/me', (c) => c.json({ todo: 'whoami' }))
  .post('/api/v1/agent/me/rotate-key', (c) => c.json({ todo: 'rotate-key' }))
  .delete('/api/v1/agent/me', (c) => c.body(null, 204))

  // ── Public well-known (issuer) ───────────────────────
  .get('/.well-known/jwks.json', (c) => c.json({ keys: [] }))
  .get('/.well-known/did.json', (c) =>
    c.json({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: 'did:web:citizenry.id',
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    }),
  )

  // ── Public well-known (per agent) ─────────────────────
  .get('/agent/:id/jwks.json', (c) => c.json({ keys: [], _agent: c.req.param('id') }))
  .get('/agent/:id/did.json', (c) =>
    c.json({
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: `did:web:citizenry.id:agent:${c.req.param('id')}`,
      verificationMethod: [],
      authentication: [],
      assertionMethod: [],
    }),
  )

// ── Federation public surface (RFC-0001) ──────────────────
//   GET  /.well-known/citizenry-peer
//   POST /federation/handshake
// Routes expect a c.var.federation service instance — injected by apps/api middleware.
mountPublicFederationRoutes(identityRouter as unknown as Hono<{ Variables: FederationVars }>)
