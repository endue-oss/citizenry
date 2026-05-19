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

export const hexToBytes = (hex: string): Uint8Array => {
  if (hex.length % 2 !== 0) throw new Error('hex length must be even')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
