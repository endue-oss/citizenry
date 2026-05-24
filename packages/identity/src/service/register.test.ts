import { describe, expect, it } from 'vitest'
import { RegisterError, verifyBindingJws } from './register'

// ── helpers ───────────────────────────────────────────
const enc = (buf: ArrayBuffer | Uint8Array): string =>
  Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url')
const td = new TextEncoder()

type Keys = {
  edPriv: CryptoKey
  sigX: string
  encX: string
}

async function freshKeys(): Promise<Keys> {
  const ed = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const edPubJwk = (await crypto.subtle.exportKey('jwk', ed.publicKey)) as { x: string }

  const x = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const xPubJwk = (await crypto.subtle.exportKey('jwk', x.publicKey)) as { x: string }

  return { edPriv: ed.privateKey, sigX: edPubJwk.x, encX: xPubJwk.x }
}

/** Build a compact binding JWS, signed by `edPriv`. */
async function buildBinding(
  k: Keys,
  opts: {
    slug?: string
    expDeltaSec?: number
    purpose?: string
    // override the public keys embedded in the payload (to simulate mismatch)
    sigX?: string
    encX?: string
    // tamper the signature
    badSig?: boolean
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'EdDSA', typ: 'citizenry-key-binding+jws' }
  const payload = {
    purpose: opts.purpose ?? 'key-binding',
    sig_jwk: { kty: 'OKP', crv: 'Ed25519', x: opts.sigX ?? k.sigX },
    enc_jwk: { kty: 'OKP', crv: 'X25519', x: opts.encX ?? k.encX },
    slug: opts.slug ?? 'scout-007',
    iat: now,
    exp: now + (opts.expDeltaSec ?? 300),
  }
  const h64 = enc(td.encode(JSON.stringify(header)))
  const p64 = enc(td.encode(JSON.stringify(payload)))
  const sig = await crypto.subtle.sign('Ed25519', k.edPriv, td.encode(`${h64}.${p64}`))
  const s64 = opts.badSig ? enc(new Uint8Array(64)) : enc(sig)
  return `${h64}.${p64}.${s64}`
}

const expectArgs = (k: Keys, over: Partial<{ sigX: string; encX: string; slug: string }> = {}) => ({
  sigX: over.sigX ?? k.sigX,
  encX: over.encX ?? k.encX,
  slug: over.slug ?? 'scout-007',
  now: Math.floor(Date.now() / 1000),
})

describe('verifyBindingJws', () => {
  it('accepts a well-formed binding signed by the sig key', async () => {
    const k = await freshKeys()
    const jws = await buildBinding(k)
    await expect(verifyBindingJws(jws, expectArgs(k))).resolves.toBeUndefined()
  })

  it('rejects a tampered signature', async () => {
    const k = await freshKeys()
    const jws = await buildBinding(k, { badSig: true })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toBeInstanceOf(RegisterError)
  })

  it('rejects when enc_jwk does not match the submitted enc key', async () => {
    const k = await freshKeys()
    const other = await freshKeys()
    // binding embeds a different enc key than the one the server expects
    const jws = await buildBinding(k, { encX: other.encX })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toMatchObject({
      code: 'binding_invalid',
    })
  })

  it('rejects when sig_jwk does not match the submitted sig key', async () => {
    const k = await freshKeys()
    const other = await freshKeys()
    // payload claims another sig key; signature still by k.edPriv, so the
    // server-expected sigX no longer matches the embedded one
    const jws = await buildBinding(k, { sigX: other.sigX })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toMatchObject({
      code: 'binding_invalid',
    })
  })

  it('rejects a slug mismatch', async () => {
    const k = await freshKeys()
    const jws = await buildBinding(k, { slug: 'someone-else' })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toMatchObject({
      code: 'binding_invalid',
    })
  })

  it('rejects an expired binding', async () => {
    const k = await freshKeys()
    const jws = await buildBinding(k, { expDeltaSec: -10 })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toMatchObject({
      code: 'binding_invalid',
    })
  })

  it('rejects a wrong purpose', async () => {
    const k = await freshKeys()
    const jws = await buildBinding(k, { purpose: 'not-a-binding' })
    await expect(verifyBindingJws(jws, expectArgs(k))).rejects.toMatchObject({
      code: 'binding_invalid',
    })
  })

  it('rejects a non-compact JWS', async () => {
    const k = await freshKeys()
    await expect(verifyBindingJws('a.b', expectArgs(k))).rejects.toBeInstanceOf(RegisterError)
  })
})
