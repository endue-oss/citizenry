// Minimal JOSE helpers shared by the bearer-JWT verifier (`auth.ts`)
// and the body-JWS verifier (`service/token.ts`). Pure WebCrypto — no
// DB, repo, or router dependency.

export const base64urlToBytes = (s: string): Uint8Array => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export const base64urlToString = (s: string): string =>
  new TextDecoder().decode(base64urlToBytes(s))

export const bytesToBase64url = (b: Uint8Array): string => {
  let bin = ''
  for (const byte of b) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface CompactJws {
  h64: string
  p64: string
  s64: string
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

/** Split + JSON-decode a compact JWS. Returns null when malformed. */
export const parseCompactJws = (token: string): CompactJws | null => {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h64, p64, s64] = parts as [string, string, string]
  try {
    const header = JSON.parse(base64urlToString(h64)) as unknown
    const payload = JSON.parse(base64urlToString(p64)) as unknown
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      return null
    }
    return {
      h64,
      p64,
      s64,
      header: header as Record<string, unknown>,
      payload: payload as Record<string, unknown>,
    }
  } catch {
    return null
  }
}

/** Ed25519 verify over a JWS signing input (`header.payload`). */
export const verifyEd25519 = async (
  publicKey: Uint8Array,
  signature: Uint8Array,
  signingInput: Uint8Array,
): Promise<boolean> => {
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
      'verify',
    ])
  } catch {
    return false
  }
  return crypto.subtle.verify('Ed25519', key, signature, signingInput)
}
