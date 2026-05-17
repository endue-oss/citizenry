// 페더레이션 핸드셰이크 JWS verify.
//
// 외부 crypto 라이브러리를 직접 의존하지 않도록 verifier 를 주입한다.
// production 에서는 `jose` (또는 동등한 EdDSA 검증 함수) 를 전달.

import { FED } from './errors'
import type { FederationHandshakePayload, FederationPurpose } from './types'

/**
 * JWS verifier 시그니처.
 *
 * - 입력: compact JWS, peer JWKS (JSON 객체).
 * - 성공: parsed payload (JSON object — caller 가 narrowing).
 * - 실패: throw FederationError (FED.jwsVerifyFailed 권장).
 */
export type JwsVerifier = (
  compactJws: string,
  jwks: Record<string, unknown>,
) => Promise<Record<string, unknown>>

const PURPOSES: ReadonlySet<FederationPurpose> = new Set([
  'federation.invite',
  'federation.invite.ack',
  'federation.confirm',
  'federation.confirm.ack',
  'federation.revoke',
  'federation.suspend',
  'federation.resume',
])

const NONCE_RE = /^[A-Za-z0-9_-]{16,}$/

const requireString = (
  v: unknown,
  field: string,
  detail?: Record<string, unknown>,
): string => {
  if (typeof v !== 'string' || v.length === 0) {
    throw FED.jwsVerifyFailed(`missing or invalid ${field}`, detail)
  }
  return v
}

/**
 * Compact JWS → 검증된 핸드셰이크 payload.
 *
 * 검사 순서 (RFC-0001 §"Handshake initiate"):
 *   1) verifier 호출 → alg=EdDSA, kid ∈ jwks 검증 + 서명 확인
 *   2) `purpose` enum 멤버 확인
 *   3) `to_issuer` 가 우리쪽 issuer 와 일치
 *   4) `from_issuer` host 가 정상 https URL
 *   5) iat/exp 범위 (`exp - iat ≤ 600`, `exp ≥ now`)
 *   6) nonce 형식 — base64url 16+ chars
 *
 * `selfIssuer` 는 우리 인스턴스의 issuer URL — 이 verify 가 inbound 요청을 받는 측에서 호출됨.
 * `expectedFromIssuer` 가 주어지면 (예: 알려진 peer 의 ack 검증) 그 issuer 와도 매칭.
 */
export const verifyHandshakeJws = async (
  verifier: JwsVerifier,
  compactJws: string,
  jwks: Record<string, unknown>,
  selfIssuer: string,
  expectedFromIssuer?: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<FederationHandshakePayload> => {
  let payload: Record<string, unknown>
  try {
    payload = await verifier(compactJws, jwks)
  } catch (e) {
    throw FED.jwsVerifyFailed(
      e instanceof Error ? e.message : 'verify threw',
      { kind: 'verifier' },
    )
  }

  const purpose = requireString(payload.purpose, 'purpose') as FederationPurpose
  if (!PURPOSES.has(purpose)) {
    throw FED.jwsVerifyFailed(`unknown purpose: ${purpose}`)
  }

  const fromIssuer = requireString(payload.from_issuer, 'from_issuer')
  if (expectedFromIssuer && fromIssuer !== expectedFromIssuer) {
    throw FED.issuerMismatch(
      `from_issuer ${fromIssuer} does not match peer ${expectedFromIssuer}`,
      { from_issuer: fromIssuer, expected: expectedFromIssuer },
    )
  }

  const fromInstanceId = requireString(payload.from_instance_id, 'from_instance_id')
  if (!/^ci_[0-9A-HJKMNP-TV-Z]{26}$/.test(fromInstanceId)) {
    throw FED.jwsVerifyFailed('invalid from_instance_id format')
  }

  const toIssuer = requireString(payload.to_issuer, 'to_issuer')
  if (toIssuer !== selfIssuer) {
    throw FED.issuerMismatch(`to_issuer ${toIssuer} does not match self ${selfIssuer}`, {
      to_issuer: toIssuer,
      self: selfIssuer,
    })
  }

  const iat = typeof payload.iat === 'number' ? payload.iat : NaN
  const exp = typeof payload.exp === 'number' ? payload.exp : NaN
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) {
    throw FED.jwsVerifyFailed('missing iat / exp')
  }
  if (exp - iat > 600) {
    throw FED.jwsVerifyFailed('iat..exp window > 600s', { iat, exp })
  }
  if (exp < nowSeconds) {
    throw FED.jwsVerifyFailed('JWS expired', { exp, now: nowSeconds })
  }

  const nonce = requireString(payload.nonce, 'nonce')
  if (!NONCE_RE.test(nonce)) {
    throw FED.jwsVerifyFailed('nonce must be base64url length ≥ 16')
  }

  const nonceEcho = payload.nonce_echo
  if (nonceEcho !== undefined && (typeof nonceEcho !== 'string' || !NONCE_RE.test(nonceEcho))) {
    throw FED.jwsVerifyFailed('nonce_echo must be base64url length ≥ 16 when present')
  }

  return {
    from_issuer: fromIssuer,
    from_instance_id: fromInstanceId,
    to_issuer: toIssuer,
    purpose,
    display_name: typeof payload.display_name === 'string' ? payload.display_name : undefined,
    nonce,
    nonce_echo: typeof nonceEcho === 'string' ? nonceEcho : undefined,
    iat,
    exp,
    metadata: (payload.metadata as Record<string, unknown>) ?? undefined,
  }
}
