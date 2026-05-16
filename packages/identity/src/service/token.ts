import type { Db } from '../db'

export interface TokenPayload {
  /** Subject — agent_id (RFC 7519 §4.1.2) */
  sub: string
  /** Issuer — `sub` 와 동일 (self-signed) */
  iss: string
  /** Audience — citizenry-id 또는 api.citizenry.id */
  aud: string | string[]
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
  /** Key ID — JWS header.kid 와 동일 */
  kid: string
  /** JWT ID (선택, replay 방지) */
  jti?: string
}

export type TokenService = ReturnType<typeof createTokenService>

/**
 * EdDSA JWT/JWS 검증 서비스.
 *
 * 미구현 — service 단에서:
 *   1. compact JWS parse (header.payload.signature)
 *   2. header.kid → agent_key lookup (active OR rotated)
 *   3. Ed25519 signature 검증
 *   4. exp / aud 검증
 *   5. (body JWS 인 경우) jti claim
 */
export const createTokenService = (_deps: { db: Db; audience: string[] }) => ({
  verifyJwt: async (_token: string): Promise<TokenPayload> => {
    throw new Error('not implemented')
  },

  verifyBodyJws: async (
    _jws: string,
    _expectedAction: 'rotate-key' | 'revoke',
  ): Promise<TokenPayload & { action: string; payload: unknown }> => {
    throw new Error('not implemented')
  },
})
