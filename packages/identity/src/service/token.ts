import type { Db } from '../db'

export interface TokenPayload {
  /** Subject — agent_id (RFC 7519 §4.1.2) */
  sub: string
  /** Issuer — equal to `sub` (self-signed) */
  iss: string
  /** Audience — citizenry-id or api.citizenry.id */
  aud: string | string[]
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
  /** Key ID — matches the JWS header.kid */
  kid: string
  /** JWT ID (optional, replay protection) */
  jti?: string
}

export type TokenService = ReturnType<typeof createTokenService>

/**
 * EdDSA JWT/JWS verification service.
 *
 * Not implemented — at the service layer:
 *   1. Parse compact JWS (header.payload.signature)
 *   2. Look up agent_key by header.kid (status in active OR rotated)
 *   3. Verify the Ed25519 signature
 *   4. Validate exp / aud
 *   5. (For body JWS) check the jti claim
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
