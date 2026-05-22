// Lightweight ULID minter for api Worker — Crockford Base32 26-char,
// time-sortable. Matches the prefix convention used elsewhere in the
// monorepo (`<prefix>_<26-char-ulid>`).
//
// Same shape as packages/config/src/ids.ts (intentional drift-resistant
// duplicate — the Workers runtime has no shared module for crypto-backed
// ulid yet).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

function ulid(): string {
  const now = Date.now()
  const bytes = new Uint8Array(16)
  let t = now
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t & 0xff
    t = Math.floor(t / 256)
  }
  bytes.set(randomBytes(10), 6)

  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD[(buffer >>> bits) & 0x1f]
    }
  }
  if (bits > 0) out += CROCKFORD[(buffer << (5 - bits)) & 0x1f]
  return out.slice(0, 26)
}

export const newHumanId = () => `hu_${ulid()}`
export const newHumanVerificationId = () => `hev_${ulid()}`
export const newHumanApiKeyId = () => `hak_${ulid()}`
export const newAgentId = () => `ag_${ulid()}`
export const newKid = () => `kid_${ulid()}`

// Raw API-Key body. `chk_` + 26-char Crockford Base32 of 130 random
// bits; only the peppered SHA-256 is persisted. Caller surfaces this
// once and delivers it out of band (typically via the mail Worker).
export const newApiKeyToken = (): string => {
  const buf = randomBytes(16)
  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of buf) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD[(buffer >>> bits) & 0x1f]
    }
  }
  if (bits > 0) out += CROCKFORD[(buffer << (5 - bits)) & 0x1f]
  return `chk_${out.slice(0, 26)}`
}

export const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('hex length must be even')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
