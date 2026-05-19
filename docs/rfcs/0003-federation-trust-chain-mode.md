---
id: 0003
title: Federation trust-chain mode (OpenID Federation 1.0 compatibility)
status: draft
authors:
  - "@endue-oss/citizenry-spec-editors"
date_proposed: 2026-05-20
date_accepted:
fcp_start:
fcp_end:
implementation_pr:
supersedes:
superseded_by:
tags:
  - federation
  - trust
  - openid-federation
  - extensibility
---

# RFC-0003: Federation trust-chain mode (OpenID Federation 1.0 compatibility)

## Summary

The federation model accepted in [RFC-0001](./0001-federation-peers.md)
is *bilateral*: instance A and instance B exchange JWKS directly and
record each other as `federation_peer` rows. This RFC keeps that
working model as the default but defines a small **PeerTrustResolver**
port behind the existing `fetchPeerJwks` call so a future
implementation can swap bilateral discovery for **OpenID Federation
1.0** trust chains — transitive trust via signed entity statements
anchored at a shared Trust Anchor. No protocol change today, only an
interface abstraction and a documented migration target.

## Motivation

RFC-0001's bilateral peer model is the right starting point: it scales
to dozens of instances, requires no shared infrastructure, and is easy
to reason about. It does *not* scale to ecosystems of hundreds of
instances where every instance would otherwise need O(n²) pairwise
handshakes.

The mature solution is [OpenID Federation
1.0](https://openid.net/specs/openid-federation-1_0.html): each
instance publishes a signed Entity Configuration referencing one or
more **Trust Anchors**; pairs of instances validate trust by walking
the chain instead of by direct handshake. Adding this in five years
without planning means a protocol break. Adding the port *now* costs
~50 lines of TypeScript and one interface declaration.

This RFC ships the abstraction. A subsequent RFC ships the actual
trust-chain resolver if and when adopter scale demands it.

## Guide-level explanation

A new port `PeerTrustResolver` in
`packages/identity/src/service/federation/` answers a single question:

> "Given a peer issuer URL, what is its current federation JWKS, and
> when does my cached view of it expire?"

Today this port is implemented by `BilateralResolver`, which is
exactly the current code: fetch `/.well-known/citizenry-peer`, hop to
`federation_jwks_url`, cache for 24h. Inbound handshake and admin
"refresh jwks" both go through the resolver.

A future `TrustChainResolver` would walk the OpenID Federation Entity
Statement chain from the peer to a configured Trust Anchor, applying
the resolved metadata policy. It returns the same JWKS to the same
caller, with a `policy` field describing what the trust chain
constrained.

Configuration:

```jsonc
// _config: federation.trust_mode = "bilateral" | "trust_chain"
//          (default: "bilateral")
//
// _config: federation.trust_anchors = [
//   { "entity_id": "https://anchor.example.org",
//     "jwks_url":  "https://anchor.example.org/.well-known/openid-federation" }
// ]
// (consulted only when trust_mode = "trust_chain")
```

When `trust_mode=trust_chain`, the admin "add peer" flow no longer
requires manual JWKS exchange — the operator types the peer's entity
URL and the resolver verifies the chain against a trust anchor.

## Reference-level explanation

### Port

```ts
// packages/identity/src/service/federation/resolver.ts

export type ResolvedPeerKeys = {
  /** Federation-signing JWKS (no per-agent keys). */
  jwks: Record<string, unknown>
  /** Wall-clock expiry of this resolution; resolvers MAY return a soft
   *  expiry to trigger refresh-ahead. */
  expiresAt: Date
  /** Resolution mode that produced this set — observability hint. */
  mode: 'bilateral' | 'trust_chain'
  /** When mode='trust_chain', the metadata policy resolved from the
   *  chain. Bilateral mode returns null. */
  policy: Record<string, unknown> | null
}

export interface PeerTrustResolver {
  resolve(issuer: string): Promise<ResolvedPeerKeys>
}
```

### Wiring

`FederationServicePorts` gains an optional `peerTrustResolver`. When
present, `fetchPeerJwks(...)` calls become `peerTrustResolver.resolve(
issuer).jwks`. When absent (the today path), the existing inlined
fetch logic is wrapped in the default `BilateralResolver`. This keeps
the change additive — no caller needs to know the difference.

### State machine deltas

Today's peer state machine
(`invited → pending → trusted → suspended/revoked`) is unchanged.
A trust-chain resolver shortens `pending → trusted` to a single
verification step (the chain validates atomically), but the states
are the same observables.

### Storage

`federation_peer.jwks` continues to cache the last resolved set.
A new optional column `federation_peer.trust_chain_policy` (JSON)
stores the policy returned by `TrustChainResolver`; null when
bilateral. Default deploys do not populate it.

### Error codes

No new public error codes. Trust-chain failures map onto existing
`ERR-P01-FED-3xxx` codes (peer-jwks-fetch-failed, peer-signature-
invalid, etc.) with the resolver mode appended to the error detail.

## Drawbacks

- **YAGNI risk.** Adopter scale doesn't warrant this today. Adding
  abstraction "just in case" pays interest forever. Counter: the
  abstraction is one interface, one default impl, zero behaviour
  change — the interest payment is roughly zero.
- **Wire-format gap.** OpenID Federation Entity Configurations are
  not the same shape as the `/.well-known/citizenry-peer` document
  RFC-0001 defined. A future migration would need to publish *both*
  formats during a transition window.

## Rationale and alternatives

1. **Do nothing, plan the migration when needed.** Simpler. Rejected
   because by the time we need it, callers will be entangled with the
   bilateral assumption; the refactor cost would be 10–100× larger
   than the cost of adding the port now.
2. **Adopt OpenID Federation 1.0 outright now.** Heavyweight: requires
   trust anchor infrastructure, federation entity configuration,
   metadata policies. Rejected because we don't yet have peers
   demanding it; we'd be carrying complexity with no consumer.
3. **Use SPIFFE/SPIRE workload identity.** Solves a similar
   trust-chain problem in service meshes. Rejected because SPIFFE
   targets workload-level mTLS; our model is JWT/JWKS HTTP and would
   need a translation layer.

## Prior art

- [OpenID Federation 1.0](https://openid.net/specs/openid-federation-1_0.html)
- [connect2id — OpenID Federation 1.0 and the trust chain explained](https://connect2id.com/learn/openid-federation)
- [ActivityPub federation](https://www.w3.org/TR/activitypub/) — pure bilateral, no trust chain. Our default mode matches it.
- [Matrix federation](https://matrix-org.github.io/synapse/latest/federate.html) — bilateral with DNS-anchored discovery.

## Unresolved questions

- [ ] Should the resolver port live in `packages/identity` or in a new
      `packages/federation` package? Right now there's no other caller,
      so leave it in identity.
- [ ] When (and how) does an admin switch `trust_mode`? If migration
      is irreversible, we need a one-way door; if reversible, both
      modes must keep state.
- [ ] Trust-anchor key rotation — does the bilateral mode of the
      adjacent anchor still serve as a fallback?

## Future possibilities

- A self-hostable Trust Anchor reference implementation.
- Operator UI to inspect the resolved trust chain when debugging a
  failed handshake.
- Per-realm trust mode (interacts with [RFC-0002](./0002-realm-layer-above-tenant.md):
  operator realm could insist on `trust_chain`, public realm on
  `bilateral`).

## References

- [RFC-0001 — Federation between Citizenry instances via peer ↔ tenant mapping](./0001-federation-peers.md)
- [RFC-0002 — Realm layer above tenant](./0002-realm-layer-above-tenant.md)
- [OpenID Federation 1.0 spec](https://openid.net/specs/openid-federation-1_0.html)
