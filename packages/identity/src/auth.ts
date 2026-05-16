// Lightweight verifier surface. 다른 패키지 (e.g. vault) 가
// `@citizenry/identity/auth` 로 import — router/repo/db 의존 없이.

export interface TokenPayload {
  /** Subject — agent_id */
  sub: string
  /** Issuer — `sub` 와 동일 (self-signed) */
  iss: string
  /** Audience */
  aud: string | string[]
  /** Issued at (epoch seconds) */
  iat: number
  /** Expires at (epoch seconds) */
  exp: number
  /** Key ID — header.kid 와 동일 */
  kid: string
  /** JWT ID (선택, replay 방지) */
  jti?: string
}

export interface TokenVerifier {
  /** EdDSA JWT 검증 → payload 반환. 실패 시 throw. */
  verifyJwt(token: string): Promise<TokenPayload>
}

/**
 * 다른 패키지가 의존성 주입으로 받을 수 있는 noop verifier factory.
 * 실제 구현은 @citizenry/identity/service 의 `createTokenService` 가 제공.
 */
export const createNoopVerifier = (): TokenVerifier => ({
  verifyJwt: async () => {
    throw new Error('TokenVerifier not configured')
  },
})
