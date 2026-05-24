// ULID minter for the vault domain — Crockford Base32 26-char,
// time-sortable, `<prefix>_<ulid>`. Mirrors apps/api/src/ids.ts and
// packages/config/src/ids.ts (the Workers runtime has no shared
// crypto-backed ulid module yet).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function ulid(): string {
  const now = Date.now()
  const bytes = new Uint8Array(16)
  let t = now
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t & 0xff
    t = Math.floor(t / 256)
  }
  crypto.getRandomValues(bytes.subarray(6))

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

/** Vault entry id — `ven_<ulid>`. */
export const newEntryId = (): string => `ven_${ulid()}`
