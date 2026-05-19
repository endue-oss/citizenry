// PeerTrustResolver — the abstraction layer that RFC-0003 documents.
//
// Today there is one implementation: `BilateralResolver`, which is the
// inlined logic that already runs in `service/federation/index.ts`
// (fetch `/.well-known/citizenry-peer`, hop to `federation_jwks_url`,
// cache for 24h). A future `TrustChainResolver` will validate an
// OpenID Federation 1.0 entity-statement chain instead.
//
// Both impls satisfy the same contract — return a resolved JWKS plus
// an expiry the cache can use. Callers do not branch on `mode`; it is
// an observability hint.
//
// The port file ships ahead of any consumer migration so future RFCs
// land against a stable surface. Callers in `index.ts` continue to use
// `fetchPeerJwks` directly; the port adoption is a separate PR.

import type { Fetcher } from './discovery'
import { fetchPeerDiscovery, fetchPeerJwks } from './discovery'
import type { PeerDiscoveryDocument } from './types'

export type ResolvedPeerKeys = {
  /** Federation-signing JWKS (no per-agent keys). */
  jwks: Record<string, unknown>
  /** Wall-clock expiry of this resolution. Resolvers MAY return a soft
   *  value to trigger refresh-ahead behaviour in the cache. */
  expiresAt: Date
  /** Resolution mode that produced this set — observability hint. */
  mode: 'bilateral' | 'trust_chain'
  /** Bilateral-mode peer discovery document (display_name, instance_id,
   *  federation_handshake_url, …). `null` for trust_chain mode — the
   *  trust-chain resolver surfaces equivalent metadata via `policy`. */
  bilateralDiscovery: PeerDiscoveryDocument | null
  /** Metadata policy resolved from the chain. Always null for
   *  bilateral mode. */
  policy: Record<string, unknown> | null
}

export interface PeerTrustResolver {
  resolve(issuer: string): Promise<ResolvedPeerKeys>
}

// ── Bilateral (default, today's behaviour) ─────────────────────

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

export function createBilateralResolver(
  fetcher: Fetcher,
  opts: { ttlMs?: number; now?: () => number } = {},
): PeerTrustResolver {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const now = opts.now ?? Date.now
  return {
    async resolve(issuer): Promise<ResolvedPeerKeys> {
      const discovery = await fetchPeerDiscovery(fetcher, issuer)
      const jwks = await fetchPeerJwks(fetcher, discovery.federation_jwks_url)
      return {
        jwks,
        expiresAt: new Date(now() + ttlMs),
        mode: 'bilateral',
        bilateralDiscovery: discovery,
        policy: null,
      }
    },
  }
}
