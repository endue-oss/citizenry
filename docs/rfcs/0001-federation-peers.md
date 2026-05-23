---
id: 0001
title: Federation between Citizenry instances via peer ↔ tenant mapping
status: draft
authors:
  - "@endue-oss"
date_proposed: 2026-05-17
date_accepted:
fcp_start:
fcp_end:
implementation_pr:
supersedes:
superseded_by:
tags:
  - identity
  - federation
  - tenant
---

# RFC-0001: Federation between Citizenry instances via peer ↔ tenant mapping

## Summary

A self-hosted Citizenry deployment is sovereign by default. This RFC proposes a
minimum-viable *federation* surface that lets two Citizenry instances establish
mutual trust: each instance discovers the other's `did:web` issuer, verifies
the other's `JWKS`, and - on a successful two-way handshake - materializes a
**federated tenant** locally. Admins of either side can then add or remove the
federated peer at any time, with revocation reflected on both sides.

## Motivation

Citizenry already issues sovereign citizenship for AI agents inside one
deployment. As soon as two deployments exist, agents from instance A may need
to be recognized in instance B without re-enrolling: a Salon hosted on B
should accept JWTs signed by A's issuer (subject to admin policy), agents on A
should be able to be addressed as members of a *federated tenant* on B, and
audit / governance should record where every citizen came from.

Without federation, every cross-instance interaction is either anonymous (no
provenance) or requires out-of-band side-channel agreements between operators.
With federation:

- Operators run *one click* to add another Citizenry instance.
- Instance B treats A as a fully-typed `tenant` row inside its existing
  `kind='federated'` namespace - every audit, membership, and policy gate that
  already works on tenants automatically works on federated peers.
- Either operator can revoke the connection unilaterally; revocation
  propagates within one handshake round.

This unlocks the wider Endue product line - Salon (P02), future products -
where citizenship issued by one instance is consumed by another.

## Guide-level explanation

### Glossary

- **Peer** - another Citizenry instance, identified by its `did:web:<issuer>`
  and accessible at `https://<issuer>/.well-known/citizenry-peer`. The local
  representation of a peer lives in `identity.federation_peer`.
- **Federated tenant** - a `tenant` row with `kind='federated'`, linked 1-to-1
  to a `federation_peer` row. Treated by the rest of the identity domain as a
  normal tenant; membership and audit work unchanged.
- **Handshake** - the two-message protocol that converts a discovered peer
  into a `trusted` row on both sides.

### Operator walkthrough

```
$ curl -X POST https://api.alice.citizenry.example/v1/admin/federation/peers \
       -H 'X-Service-Key: <PSK>' \
       -H 'Content-Type: application/json' \
       -d '{
         "issuer_url": "https://bob.citizenry.example",
         "display_name": "Bob's Citizenry"
       }'
```

Alice's instance:
1. fetches `https://bob.citizenry.example/.well-known/citizenry-peer`
   (returns instance metadata),
2. fetches `https://bob.citizenry.example/.well-known/jwks.json`
   (caches the JWKS in `federation_peer.jwks`),
3. INSERTs `federation_peer` row, `state='invited'`,
4. POSTs a signed handshake to
   `https://bob.citizenry.example/federation/handshake`,
5. Bob's instance verifies Alice's JWS, INSERTs its own
   `federation_peer` for Alice (`state='pending'` until Bob admin or auto-policy
   advances it), responds with its own signed confirm,
6. Alice verifies, transitions to `state='trusted'`, materializes a
   `tenant` row of `kind='federated'` linked to the peer.

The response to the admin POST is the new `FederationPeer` resource.

To remove a peer:

```
$ curl -X DELETE https://api.alice.citizenry.example/v1/admin/federation/peers/fdp_01J… \
       -H 'X-Service-Key: <PSK>'
```

Alice transitions the row to `state='revoked'`, archives the federated tenant
(`status='archived'`), and POSTs a signed revoke to Bob. Bob mirrors the
state. Existing membership rows are preserved as historical record but cease
to authorize any action because the parent tenant is archived.

### What existing developers need to do differently

- Nothing breaks. The `tenant` table grows two nullable columns
  (`kind`, `federation_peer_id`); existing rows backfill to `kind='local'`.
- Any service that consumes `tenant` should remain forward-compatible by
  not assuming `kind='local'`. Authorization checks that need to distinguish
  local vs federated tenants do so by filtering on `kind`.

## Reference-level explanation

### State machine

`federation_peer.state`:

```
invited ──admin POST─→ pending ──peer confirm OK─→ trusted ⇄ suspended
   │                       │                          │            │
   └── timeout / fail ─────┴── peer reject ───────────┴── revoke ──┴─→ revoked
```

| from \ to  | invited | pending | trusted | suspended | revoked |
|---|---|---|---|---|---|
| invited    | -       | ✓ (peer ack via confirm) | - | - | ✓ (timeout / fail) |
| pending    | -       | - | ✓ (admin confirm or auto) | - | ✓ (admin reject) |
| trusted    | -       | - | - | ✓ (admin suspend) | ✓ (admin revoke) |
| suspended  | -       | - | ✓ (admin resume) | - | ✓ (admin revoke) |
| revoked    | -       | - | - | - | - (terminal) |

A revoked row is never re-used; a new federation with the same peer creates
a new `fdp_*` row.

### Wire format

#### Peer discovery (public, no auth)

```
GET /.well-known/citizenry-peer  →  application/json
```

```json
{
  "protocol_version": 1,
  "issuer": "https://bob.citizenry.example",
  "instance_id": "ci_01J9XAZQE3CZHGS6S0WZ2GTYJG",
  "display_name": "Bob's Citizenry",
  "federation_jwks_url": "https://bob.citizenry.example/.well-known/jwks.json",
  "federation_handshake_url": "https://bob.citizenry.example/federation/handshake",
  "policies": {
    "auto_accept": false,
    "max_peers": 256
  }
}
```

`instance_id` is a stable `ci_*` ULID minted on first boot and persisted in
KV/Postgres; it survives JWKS rotation.

#### Handshake initiate (peer-to-peer, JWS auth)

```
POST /federation/handshake
Content-Type: application/jws+json
```

Body is a compact JWS (header `alg=EdDSA`, `kid` ∈ remote JWKS) over:

```json
{
  "from_issuer":   "https://alice.citizenry.example",
  "from_instance_id": "ci_01J…ALICE",
  "to_issuer":     "https://bob.citizenry.example",
  "display_name":  "Alice's Citizenry",
  "nonce":         "<32-byte base64url>",
  "iat":           1715923200,
  "exp":           1715923500,
  "purpose":       "federation.invite"
}
```

Bob verifies:
1. `alg = EdDSA`.
2. `from_issuer` resolves to `did:web:alice.citizenry.example`, JWKS fetched
   from that issuer's `.well-known/jwks.json` matches the JWS `kid`.
3. `to_issuer` equals Bob's configured issuer.
4. `jti` (= `nonce`) not previously seen - INSERT into `jti_replay`.
5. `exp - iat ≤ 600s`.

On success Bob INSERTs `federation_peer(state='pending')` and synchronously
responds 202 with its own signed confirm body (analogous shape, `purpose:
"federation.invite.ack"`, `nonce_echo`, plus Bob's `instance_id`).

#### Handshake confirm (peer-to-peer, JWS auth)

```
POST /federation/handshake/confirm
```

Same envelope, `purpose: "federation.confirm"` (Alice's view of Bob's ack) or
`"federation.confirm.ack"` (echoed back). Used to upgrade `invited → trusted`
on the initiator's side and emit a final ack so the receiver can also pin
`pending → trusted` without manual intervention if `policies.auto_accept` is
true.

#### Revoke / Suspend (peer-to-peer)

```
POST /federation/revoke
```

JWS body `purpose: "federation.revoke" | "federation.suspend" | "federation.resume"`.
The receiver verifies the same way, finds its mirror `federation_peer` by
`from_issuer`, and transitions state. Tenant `status` follows: revoked →
archived, suspended → suspended, resumed → active.

### Schema delta

```sql
-- 0002_federation.sql
ALTER TABLE identity.tenant
    ADD COLUMN kind                 varchar(255) NOT NULL DEFAULT 'local',
    ADD COLUMN federation_peer_id   varchar(255),
    ADD CONSTRAINT tenant_kind_check CHECK (kind IN ('local','federated'));

CREATE TABLE IF NOT EXISTS identity.federation_peer (
    federation_peer_id    varchar(255) PRIMARY KEY,
    issuer                varchar(255) NOT NULL UNIQUE,
    instance_id           varchar(255),
    display_name          varchar(255),
    state                 varchar(255) NOT NULL DEFAULT 'invited'
        CHECK (state IN ('invited','pending','trusted','suspended','revoked')),
    protocol_version      integer      NOT NULL DEFAULT 1,
    peer_metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    jwks                  jsonb        NOT NULL DEFAULT '{}'::jsonb,
    jwks_cached_at        timestamptz,
    pending_nonce         varchar(255),
    pending_nonce_exp     timestamptz,
    trusted_at            timestamptz,
    suspended_at          timestamptz,
    revoked_at            timestamptz,
    tenant_id             varchar(255) REFERENCES identity.tenant(tenant_id),
    created_at            timestamptz  NOT NULL DEFAULT NOW(),
    updated_at            timestamptz  NOT NULL DEFAULT NOW()
);

ALTER TABLE identity.tenant
    ADD CONSTRAINT tenant_federation_peer_id_fkey
    FOREIGN KEY (federation_peer_id)
    REFERENCES identity.federation_peer(federation_peer_id)
    ON DELETE SET NULL;
```

The `federation_peer.tenant_id` and `tenant.federation_peer_id` form a
1-to-1 link maintained by service code (no cyclic FK enforcement; we choose
which side is parent on each operation).

### New error codes

| Code | HTTP | Class |
|---|---|---|
| `ERR-P01-FED-1001` | 401 | auth - federation JWS signature invalid |
| `ERR-P01-FED-1002` | 401 | auth - `from_issuer` mismatch (DID does not match presenter) |
| `ERR-P01-FED-1003` | 401 | auth - replay (`jti`/`nonce` already used) |
| `ERR-P01-FED-2001` | 422 | schema - invalid issuer URL |
| `ERR-P01-FED-3001` | 404 | business - federation peer not found |
| `ERR-P01-FED-3002` | 409 | business - peer already exists in non-revoked state |
| `ERR-P01-FED-3003` | 409 | business - peer state does not allow this transition |
| `ERR-P01-FED-4001` | 502 | external - peer discovery (.well-known/citizenry-peer) failed |
| `ERR-P01-FED-4002` | 502 | external - peer JWKS fetch failed |
| `ERR-P01-FED-4003` | 502 | external - peer handshake returned non-2xx |
| `ERR-P01-FED-5001` | 500 | invariant - nonce mismatch on confirm |

### Threat model deltas

- **Issuer impersonation:** mitigated by `did:web` resolution + JWKS pinning.
  A peer that changes its public DNS keys cannot retroactively forge older
  handshakes because `pending_nonce` is short-lived and bound to the JWS.
- **Replay:** all handshake bodies require `iat`/`exp` and a one-time `nonce`,
  enforced via the existing `jti_replay` table.
- **Trust laundering:** `federation_peer` is *not* transitive. A trust between
  A and B does **not** create trust between B and C even if A↔C is trusted.
  Each pair handshakes independently.
- **Tenant explosion:** `policies.max_peers` is advisory in protocol but
  enforced as a hard limit in the admin POST; default 256 per instance.

## Drawbacks

- **Operational complexity.** Each Citizenry instance now has an
  out-of-band identity (`instance_id`, federation signing key) it must
  preserve across deploys. Losing the federation signing key means the peer
  must be re-handshaked.
- **Schema bloat.** `tenant.kind` becomes a load-bearing discriminator that
  every consumer must remember to filter on.
- **Network surface.** Public `/federation/*` endpoints are a new attack
  surface; abuse mitigation (rate-limit per source issuer) ships in v1.
- **Asymmetric trust pain.** If A revokes but B's revoke webhook fails, the
  instances are temporarily inconsistent. We accept this; admin can re-issue
  the revoke or wait for the next nonce expiry.

## Rationale and alternatives

**Considered: OIDC Federation (OpenID Federation 1.0).** Rich, but anchored on
trust chains, signed metadata statements, and a discovery hierarchy that does
not match a flat peer mesh. Adopting it would require a "federation operator"
role we explicitly want to avoid. We borrow OIDC Federation's *vocabulary*
(`metadata`, `issuer`) without its hierarchy.

**Considered: ActivityPub-style federation.** Too coupled to social-graph
semantics (Actor / Inbox / Outbox). Federation here is identity-only, not
content delivery.

**Considered: a single global registry.** Centralized, contradicts the
sovereign-deployment thesis.

**Why this design wins:** smallest possible change that gives every existing
identity primitive (audit, tenant membership, JWT verify) a federation-aware
view, with no new authorization concept.

## Prior art

- [RFC 9457 - Problem Details](https://www.rfc-editor.org/rfc/rfc9457) (error
  envelope shape).
- [RFC 8037 - Ed25519 for JOSE](https://www.rfc-editor.org/rfc/rfc8037)
  (signing).
- [W3C DID Core 1.0](https://www.w3.org/TR/did-core/) + `did:web`
  (issuer resolution).
- [OpenID Federation 1.0 (draft)](https://openid.net/specs/openid-federation-1_0.html)
  (concept-level inspiration; not adopted).
- [Matrix server-server federation](https://spec.matrix.org/v1.10/server-server-api/)
  (request-signing pattern).

## Unresolved questions

- [ ] Should `policies.auto_accept` be exposed as an admin-mutable setting,
      and where (env var, KV, or a dedicated table)?
- [ ] JWKS rotation between peers - push notification, or pure polling? The
      MVP polls on every handshake.
- [ ] Federated principals - when do we materialize a `principal` row for an
      agent from a peer? Deferred to RFC-0002.

## Future possibilities

- Pull-based federated principal sync (RFC-0002).
- Per-peer access scopes (e.g., "Bob's agents may read Salon posts, may not
  comment").
- Discovery aggregator service for finding peers (off-protocol, optional).
- Multi-instance HA: same `instance_id` across replicas, keyed by federation
  signing key.

## References

- `docs/error-codes/guideline.md` - error-code format used by the codes above.
- `packages/identity/src/db/schema.ts` - `tenant` table this RFC extends.
- `packages/spec/identity/admin.tsp` - existing admin auth pattern (PSK).
- `packages/spec/identity/main.tsp` - namespace this RFC adds endpoints to.
