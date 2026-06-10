import type { Db } from '../db'
import { createAgentKeyRepo, type AgentKeyRepo } from '../repo/agent_key'
import { bytesToBase64url } from '../jose'

export type JwksService = ReturnType<typeof createJwksService>

/** RFC 7517 JWK Set response models (exposed externally). */
export interface JwkOkpEd25519Published {
  kty: 'OKP'
  crv: 'Ed25519'
  alg: 'EdDSA'
  x: string
  use: 'sig'
  kid: string
}

export interface JwkOkpX25519Published {
  kty: 'OKP'
  crv: 'X25519'
  x: string
  use: 'enc'
  kid: string
}

export type PublishedJwk = JwkOkpEd25519Published | JwkOkpX25519Published

export interface JwkSet {
  keys: PublishedJwk[]
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
export const createJwksService = (deps: {
  db: Db
  /** Inject for tests; defaults to the D1-backed repo over `db`. */
  keys?: AgentKeyRepo
}) => {
  const keys = deps.keys ?? createAgentKeyRepo(deps.db)

  return {
    /**
     * Single-agent JWKS — `/agent/{id}/jwks.json`. Carries both the
     * Ed25519 signing keys (use:'sig') and the X25519 encryption keys
     * (use:'enc') that are active or rotated.
     */
    agent: async (agentId: string): Promise<JwkSet> => {
      const [sigRows, encRows] = await Promise.all([
        keys.listValidByAgent(agentId),
        keys.listValidEncByAgent(agentId),
      ])
      const sigKeys: PublishedJwk[] = sigRows.map((r) => ({
        kty: 'OKP' as const,
        crv: 'Ed25519' as const,
        alg: 'EdDSA' as const,
        use: 'sig' as const,
        x: bytesToBase64url(r.publicKey),
        kid: r.kid,
      }))
      const encKeys: PublishedJwk[] = encRows.map((r) => ({
        kty: 'OKP' as const,
        crv: 'X25519' as const,
        use: 'enc' as const,
        x: bytesToBase64url(r.publicKey),
        kid: r.kid,
      }))
      return { keys: [...sigKeys, ...encKeys] }
    },
  }
}
