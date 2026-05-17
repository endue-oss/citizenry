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
 * JWKS builder.
 *
 * Not implemented — the issuer JWKS aggregates active+rotated keys from every registered
 * agent (will need caching / physical split for performance). The agent JWKS contains
 * only the active+rotated keys of a single agent.
 */
export const createJwksService = (deps: { db: Db }) => {
  const keys = createAgentKeyRepo(deps.db)

  return {
    /** Whole-issuer JWKS — `/.well-known/jwks.json`. */
    issuer: async (): Promise<JwkSet> => {
      throw new Error('not implemented')
    },

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
