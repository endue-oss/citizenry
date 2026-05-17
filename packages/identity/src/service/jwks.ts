import type { Db } from '../db'
import { createAgentKeyRepo } from '../repo/agent_key'

export type JwksService = ReturnType<typeof createJwksService>

/** RFC 7517 JWK Set response model (exposed externally). */
export interface JwkOkpEd25519Published {
  kty: 'OKP'
  crv: 'Ed25519'
  alg: 'EdDSA'
  x: string
  use?: 'sig'
  kid: string
}

export interface JwkSet {
  keys: JwkOkpEd25519Published[]
}

/**
 * Per-agent JWKS builder.
 *
 * Per ADR-2026-0003 there is no aggregate-over-all-agents JWKS. Verifiers
 * resolve the JWT `iss` claim to `/agent/{iss}/jwks.json` and look up the
 * single key matching `header.kid`. The instance-level federation JWKS at
 * `/.well-known/jwks.json` is a separate, bounded key set and is not
 * served from this service.
 */
export const createJwksService = (deps: { db: Db }) => {
  const keys = createAgentKeyRepo(deps.db)

  return {
    /** Single-agent JWKS — `/agent/{id}/jwks.json`. */
    agent: async (agentId: string): Promise<JwkSet> => {
      const rows = await keys.listValidByAgent(agentId)
      return {
        keys: rows.map((r) => ({
          kty: 'OKP' as const,
          crv: 'Ed25519' as const,
          alg: 'EdDSA' as const,
          use: 'sig' as const,
          x: Buffer.from(r.publicKey).toString('base64url'),
          kid: r.kid,
        })),
      }
    },
  }
}
