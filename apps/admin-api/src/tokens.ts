// Access-token helpers — HS256 over the ADMIN_JWT_SECRET.
//
// hono's built-in JWT util drives sign/verify; we wrap it so callers
// don't have to pass secret/algorithm everywhere. Verification is
// strict on `exp` and `nbf` (defaults); we also pin `iss` to `admin-api`
// and `aud` to "admin" so a token minted elsewhere can't be replayed
// against admin-api.

import { sign, verify } from 'hono/utils/jwt/jwt'

const ALG = 'HS256'
const ISS = 'citizenry-admin-api'
const AUD = 'citizenry-admin'

export type AccessTokenClaims = {
  sub: string
  typ: 'access'
  iss: typeof ISS
  aud: typeof AUD
  iat: number
  exp: number
  jti: string
}

const newJti = () => {
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  let s = ''
  for (const b of buf) s += b.toString(16).padStart(2, '0')
  return s
}

export async function signAccessToken(input: {
  secret: string
  adminId: string
  ttlSecs: number
  now?: () => number
}): Promise<{ token: string; expiresAt: number; claims: AccessTokenClaims }> {
  const now = input.now ?? (() => Math.floor(Date.now() / 1000))
  const iat = now()
  const exp = iat + input.ttlSecs
  const claims: AccessTokenClaims = {
    sub: input.adminId,
    typ: 'access',
    iss: ISS,
    aud: AUD,
    iat,
    exp,
    jti: newJti(),
  }
  const token = await sign(claims, input.secret, ALG)
  return { token, expiresAt: exp, claims }
}

export type VerifyResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: 'expired' | 'invalid' }

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<VerifyResult> {
  try {
    const payload = (await verify(token, secret, {
      alg: ALG,
      iss: ISS,
      aud: AUD,
    })) as AccessTokenClaims
    if (payload.typ !== 'access') return { ok: false, reason: 'invalid' }
    return { ok: true, claims: payload }
  } catch (err) {
    if (isExpiredErr(err)) return { ok: false, reason: 'expired' }
    return { ok: false, reason: 'invalid' }
  }
}

function isExpiredErr(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'JwtTokenExpired',
  )
}
