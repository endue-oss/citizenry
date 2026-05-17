// Federation handshake JWS verification.
//
// The verifier is injected so this module does not depend directly on any
// crypto library. Production callers pass `jose` (or an equivalent EdDSA
// verifier).

import { FED } from './errors'
import type { FederationHandshakePayload, FederationPurpose } from './types'

/**
 * JWS verifier signature.
 *
 * - Inputs: compact JWS, peer JWKS (JSON object).
 * - Success: parsed payload (JSON object — caller narrows the type).
 * - Failure: throw FederationError (FED.jwsVerifyFailed recommended).
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
 * Compact JWS → verified handshake payload.
 *
 * Check order (RFC-0001 §"Handshake initiate"):
 *   1) Call verifier → asserts alg=EdDSA, kid ∈ jwks, and a valid signature.
 *   2) `purpose` is a known enum member.
 *   3) `to_issuer` matches our issuer.
 *   4) `from_issuer` is a well-formed https URL.
 *   5) iat/exp window (`exp - iat ≤ 600`, `exp ≥ now`).
 *   6) nonce shape — base64url, 16+ chars.
 *
 * `selfIssuer` is our instance's issuer URL — this verify runs on the
 * inbound side. When `expectedFromIssuer` is provided (e.g. verifying the
 * ack from a known peer), the payload's `from_issuer` must match it too.
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
