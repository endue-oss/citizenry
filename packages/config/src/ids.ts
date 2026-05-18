// Lightweight ULID generator for config rows. Crockford base32, 26
// chars, time-sortable. Matches the prefix convention used by the
// rest of the citizenry monorepo (`<prefix>_<26-char-ulid>`).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

export function ulid(): string {
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

export const newConfigId = () => `cfg_${ulid()}`
