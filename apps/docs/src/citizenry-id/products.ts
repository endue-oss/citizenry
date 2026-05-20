// Product page content. Mirrors the three modules surfaced in Header > Features
// and the on-home Modules section. Each product has its own deep-dive page.
//
// Visual hints stay light — section.visual is a discriminated union the
// ProductPage component knows how to render. Keep these declarative so design
// iteration doesn't require touching the page template.

export type ProductId = 'identity' | 'mail' | 'vault'

export type Visual =
  | { kind: 'none' }
  | { kind: 'code'; lang?: string; lines: string[] }
  | { kind: 'kv'; rows: { k: string; v: string }[] }

export type Section = {
  kicker?: string
  title: string
  body: string
  visual?: Visual
}

export type Product = {
  id: ProductId
  slug: string // url path segment, e.g. 'identity'
  name: string // header tab label, e.g. 'Identity'
  tagline: string // hero h1
  blurb: string // hero subhead, 1–2 sentences
  endpoint: string // primary API hint (mono pill near hero)
  // Tone keys map to the existing --mod-* tokens in styles/tokens.scss.
  tone: ProductId
  sections: Section[]
}

export const PRODUCTS: Product[] = [
  // ─── Identity ─────────────────────────────────────────────────────────
  {
    id: 'identity',
    slug: 'identity',
    name: 'Identity',
    tagline: 'Self-sovereign identity for autonomous agents.',
    blurb:
      'Ed25519 keys generated on the agent. JWTs signed by the agent. The server never holds your private key — yet anyone can verify who signed what.',
    endpoint: 'POST /identity/v1/agent/register',
    tone: 'identity',
    sections: [
      {
        kicker: 'KEYS NEVER LEAVE',
        title: 'Generate locally. Publish only the public JWK.',
        body:
          'Each agent creates its own Ed25519 keypair on first run. Only the public key is registered. There is no shared signing secret, no KMS to compromise, and no support ticket required to rotate.',
        visual: {
          kind: 'code',
          lang: 'sh',
          lines: [
            '$ citizenry keygen',
            '→ kid: ag_7e2a…b91c',
            '→ public jwk: published',
            '→ private jwk: never leaves this device',
          ],
        },
      },
      {
        kicker: 'DID:WEB + JWKS',
        title: 'Discoverable. Verifiable. Public by default.',
        body:
          'Your agent identity is published as a did:web document with a JWKS. Any party — auditor, peer agent, downstream service — can resolve and verify your signatures without contacting citizenry.id.',
        visual: {
          kind: 'kv',
          rows: [
            { k: 'did', v: 'did:web:citizenry.id:agents:ag_7e2a' },
            { k: 'jwks', v: 'https://api.citizenry.id/.well-known/jwks.json' },
            { k: 'kid', v: 'ag_7e2a…b91c' },
            { k: 'alg', v: 'EdDSA' },
          ],
        },
      },
      {
        kicker: 'ROTATE & REVOKE',
        title: 'Move keys without asking permission.',
        body:
          'Publish a new JWK, mark the old one expired, sign with the new one. Revocation is a single PATCH; downstream verifiers see it the next time they refresh JWKS.',
      },
    ],
  },

  // ─── Mail ─────────────────────────────────────────────────────────────
  {
    id: 'mail',
    slug: 'mail',
    name: 'Mail',
    tagline: 'Programmable mail for autonomous agents.',
    blurb:
      'Every citizen gets a real mailbox at {slug}@citizenry.id, isolated per tenant. Speak JMAP, SMTP, or IMAP — no glue code, no third-party relay.',
    endpoint: 'GET /mail/v1/inbox',
    tone: 'mail',
    sections: [
      {
        kicker: 'INBOX ON DAY ONE',
        title: 'Provisioned at registration. Reachable immediately.',
        body:
          'When an agent enrolls, an inbox is allocated atomically. No DNS dance, no MX configuration, no waiting for propagation. The first mail can arrive seconds after the keypair is published.',
        visual: {
          kind: 'kv',
          rows: [
            { k: 'address', v: 'crawler-7e2a@citizenry.id' },
            { k: 'jmap', v: 'mail.citizenry.id/jmap' },
            { k: 'imap', v: 'mail.citizenry.id:993 (TLS)' },
            { k: 'smtp', v: 'mail.citizenry.id:465 (TLS)' },
          ],
        },
      },
      {
        kicker: 'PROTOCOL OF YOUR CHOICE',
        title: 'JMAP, SMTP, IMAP — pick one. Or all three.',
        body:
          'JMAP for modern integrations and bulk mutations. SMTP/IMAP for legacy clients. The agent JWT authenticates each protocol — no separate password vocabulary.',
      },
      {
        kicker: 'TENANT-ISOLATED',
        title: 'Row-level isolation between agent populations.',
        body:
          'A tenant\'s agents never see another tenant\'s mail, even at the storage layer. Multi-tenant by design — no shared inbox seam where data bleeds.',
      },
    ],
  },

  // ─── Vault ────────────────────────────────────────────────────────────
  {
    id: 'vault',
    slug: 'vault',
    name: 'Vault',
    tagline: 'Encrypted before it leaves your agent.',
    blurb:
      'HPKE zero-knowledge credential storage. The server stores ciphertext only — your plaintext never crosses the wire, never sits in a KMS.',
    endpoint: 'PUT /me/credential/{service}/{name}',
    tone: 'vault',
    sections: [
      {
        kicker: 'HPKE ENCRYPTION',
        title: 'Sealed to your own JWKS, on the agent.',
        body:
          'Hybrid Public-Key Encryption to your published JWKS. There is no shared symmetric key, no envelope you and the server both hold. The seal happens before the request leaves you.',
        visual: {
          kind: 'code',
          lines: [
            '$ citizenry vault put openai/api_key sk-…',
            '→ HPKE seal → ct: 7e2a…b91c',
            '→ PUT /me/credential/openai/api_key',
            '→ server stored ciphertext ✓',
          ],
        },
      },
      {
        kicker: 'ZERO-KNOWLEDGE SERVER',
        title: 'Ciphertext at rest. Plaintext, never.',
        body:
          'The server holds opaque blobs and metadata. A breach yields ciphertext — useless without your private key. There is no operator key, no master, no break-glass.',
        visual: {
          kind: 'kv',
          rows: [
            { k: 'openai/api_key', v: 'ct: 7e2a…b91c' },
            { k: 'github/pat', v: 'ct: 4fdd…20a3' },
            { k: 'stripe/restricted', v: 'ct: c1b8…99e7' },
          ],
        },
      },
      {
        kicker: 'PER-CREDENTIAL SCOPING',
        title: 'Address by service and name. Rotate independently.',
        body:
          'Each secret is keyed by service and name. Rotate one credential without touching the rest. Audit log records every read so revocation has a clear blast radius.',
      },
    ],
  },
]

export function findProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug)
}
