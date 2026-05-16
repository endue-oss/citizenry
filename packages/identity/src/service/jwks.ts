import type { Db } from '../db'
import { createAgentKeyRepo } from '../repo/agent_key'

export type JwksService = ReturnType<typeof createJwksService>

/** RFC 7517 JWK Set 응답 모델 (서버 외부 노출). */
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
 * JWKS 빌더.
 *
 * 미구현 — issuer JWKS 는 등록된 모든 에이전트의 active+rotated 키 (성능상
 * 캐시/물리 분리 필요). agent JWKS 는 한 agent 의 active+rotated 키만.
 */
export const createJwksService = (deps: { db: Db }) => {
  const keys = createAgentKeyRepo(deps.db)

  return {
    /** issuer 전체 JWKS — `/.well-known/jwks.json`. */
    issuer: async (): Promise<JwkSet> => {
      throw new Error('not implemented')
    },

    /** 단일 agent JWKS — `/agent/{id}/jwks.json`. */
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
