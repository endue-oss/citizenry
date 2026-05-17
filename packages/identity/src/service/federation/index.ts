// Federation service — admin CRUD + inbound handshake handler.
//
// All side-effects (HTTP outbound, ULID generation, time) are injected as ports.
// This keeps the service deterministic — tests pass with mock repo + fake ports alone.

import type { FederationPeerRow } from '../../db/schema'
import type { FederationPeerRepo } from '../../repo/federation_peer'
import { fetchPeerDiscovery, fetchPeerJwks, normalizeIssuer, type Fetcher } from './discovery'
import { FED } from './errors'
import { verifyHandshakeJws, type JwsVerifier } from './jws'
import { isTransitionAllowed } from './state'
import type {
  FederationHandshakePayload,
  FederationPeerState,
  FederationPeerView,
  PeerDiscoveryDocument,
} from './types'
import { toPeerView } from './view'

export * from './types'
export * from './errors'
export { isTransitionAllowed, allowedNextStates, isTerminalState } from './state'

export interface FederationServicePorts {
  /** ULID + prefix generator. */
  newId: (prefix: 'fdp_' | 'tn_') => string

  /** 32B base64url nonce generator. */
  newNonce: () => string

  /** outbound HTTP fetch — undici / global `fetch` / fake. */
  fetcher: Fetcher

  /** compact JWS verifier (EdDSA over peer JWKS). */
  jwsVerifier: JwsVerifier

  /**
   * Called when our instance signs and sends an outbound JWS (with nonce filled in).
   * Key management is the responsibility of callers, so it is injected as a port.
   */
  signHandshake: (payload: FederationHandshakePayload) => Promise<string>

  /** Our instance's issuer URL — used to match `to_issuer` during handshake verify. */
  selfIssuer: string

  /** Our instance's instance_id (`ci_*`). */
  selfInstanceId: string

  /** epoch seconds. Inject to freeze time in tests. */
  now: () => number
}

export type FederationService = ReturnType<typeof createFederationService>

export const createFederationService = (
  repo: FederationPeerRepo,
  ports: FederationServicePorts,
) => {
  /** Operator adds a new peer — external fetch + outbound handshake initiation. */
  const addPeer = async (input: {
    issuer_url: string
    display_name?: string
  }): Promise<FederationPeerView> => {
    const issuer = normalizeIssuer(input.issuer_url)

    // 1) Check for an existing live peer with the same issuer
    const existing = await repo.findActiveByIssuer(issuer)
    if (existing) {
      throw FED.peerAlreadyExists(`peer already in state ${existing.state}`, {
        existing_id: existing.federationPeerId,
        state: existing.state,
      })
    }

    // 2) discovery + JWKS fetch
    const discovery = await fetchPeerDiscovery(ports.fetcher, issuer)
    const jwks = await fetchPeerJwks(ports.fetcher, discovery.federation_jwks_url)

    // 3) row INSERT — state='invited', pending_nonce populated
    const nonce = ports.newNonce()
    const id = ports.newId('fdp_')
    const expSec = ports.now() + 600
    const [inserted] = await repo.insert({
      federationPeerId: id,
      issuer,
      instanceId: discovery.instance_id,
      displayName: input.display_name ?? discovery.display_name ?? null,
      state: 'invited',
      protocolVersion: discovery.protocol_version,
      peerMetadata: discovery as unknown as Record<string, unknown>,
      jwks,
      jwksCachedAt: new Date(),
      pendingNonce: nonce,
      pendingNonceExp: new Date(expSec * 1000),
    })

    // 4) outbound invite — best-effort. On failure the row stays in invited state.
    const inviteJws = await ports.signHandshake({
      from_issuer: ports.selfIssuer,
      from_instance_id: ports.selfInstanceId,
      to_issuer: issuer,
      purpose: 'federation.invite',
      display_name: input.display_name,
      nonce,
      iat: ports.now(),
      exp: expSec,
    })

    try {
      const res = await ports.fetcher(discovery.federation_handshake_url, {
        method: 'POST',
        headers: { 'content-type': 'application/jws' },
        body: inviteJws,
      })
      if (!res.ok) {
        throw FED.remoteError(`peer responded ${res.status}`, { status: res.status })
      }
      const body = await res.text()
      // If the response includes an ack JWS, verify it and transition to trusted.
      // (MVP: only JSON responses are handled; pure-JWS responses are confirmed in the next round.)
      try {
        const parsed = JSON.parse(body)
        if (parsed?.ack_jws && typeof parsed.ack_jws === 'string') {
          const ack = await verifyHandshakeJws(
            ports.jwsVerifier,
            parsed.ack_jws,
            jwks,
            ports.selfIssuer,
            issuer,
            ports.now(),
          )
          if (ack.nonce_echo !== nonce) {
            throw FED.nonceMismatch('peer ack returned different nonce_echo')
          }
          // Transition to trusted + materialize federated tenant
          const linked = await repo.linkFederatedTenant(id, {
            tenantId: ports.newId('tn_'),
            slug: slugFromIssuer(issuer),
            displayName: discovery.display_name ?? input.display_name ?? null,
            status: 'active',
            kind: 'federated',
            federationPeerId: id,
          })
          return toPeerView(linked.peer)
        }
      } catch (e) {
        if ((e as { code?: string })?.code?.startsWith('ERR-P01-FED-')) throw e
        // Ignore JSON parse failure — stay pending
      }
    } catch (e) {
      if ((e as { code?: string })?.code?.startsWith('ERR-P01-FED-')) throw e
      throw FED.remoteError(
        e instanceof Error ? e.message : 'outbound handshake failed',
        { issuer },
      )
    }

    if (!inserted) throw FED.remoteError('insert returned no row')
    return toPeerView(inserted)
  }

  /** Inbound handshake — invoked when a peer calls POST /federation/handshake. */
  const handleInbound = async (
    compactJws: string,
  ): Promise<{ state: FederationPeerState; ack_jws?: string; row: FederationPeerRow }> => {
    // Unsafely parse `from_issuer` from the JWS payload first (before verify!) so we can
    // look up the peer — safe because verifyHandshakeJws will throw on a bad payload anyway.
    const peeked = peekFromIssuer(compactJws)
    if (!peeked) {
      throw FED.jwsVerifyFailed('JWS payload not parseable')
    }
    const fromIssuer = normalizeIssuer(peeked.from_issuer)

    // peer JWKS — use the cached value if a row exists, otherwise fetch via discovery.
    let row = await repo.findActiveByIssuer(fromIssuer)
    let jwks: Record<string, unknown>
    let discovery: PeerDiscoveryDocument | undefined

    if (row && Object.keys(row.jwks).length > 0) {
      jwks = row.jwks
    } else {
      discovery = await fetchPeerDiscovery(ports.fetcher, fromIssuer)
      jwks = await fetchPeerJwks(ports.fetcher, discovery.federation_jwks_url)
    }

    const verified = await verifyHandshakeJws(
      ports.jwsVerifier,
      compactJws,
      jwks,
      ports.selfIssuer,
      fromIssuer,
      ports.now(),
    )

    // Branch on purpose
    switch (verified.purpose) {
      case 'federation.invite': {
        if (row && row.state !== 'invited' && row.state !== 'pending') {
          // If already trusted/suspended, reject the new invite (rejoin requires DELETE first)
          throw FED.invalidTransition(
            `cannot accept invite while state=${row.state}`,
            { state: row.state },
          )
        }
        if (!row) {
          const id = ports.newId('fdp_')
          const [inserted] = await repo.insert({
            federationPeerId: id,
            issuer: fromIssuer,
            instanceId: verified.from_instance_id,
            displayName: verified.display_name ?? null,
            state: 'pending',
            protocolVersion: discovery?.protocol_version ?? 1,
            peerMetadata: (discovery as unknown as Record<string, unknown>) ?? {},
            jwks,
            jwksCachedAt: new Date(),
            pendingNonce: verified.nonce,
            pendingNonceExp: new Date(verified.exp * 1000),
          })
          if (!inserted) throw FED.remoteError('insert returned no row')
          row = inserted
        } else {
          const [updated] = await repo.update(row.federationPeerId, {
            instanceId: verified.from_instance_id,
            displayName: verified.display_name ?? row.displayName,
            pendingNonce: verified.nonce,
            pendingNonceExp: new Date(verified.exp * 1000),
          })
          if (!updated) throw FED.remoteError('update returned no row')
          row = updated
        }

        // Immediate ack — invite.ack JWS attached
        const ackJws = await ports.signHandshake({
          from_issuer: ports.selfIssuer,
          from_instance_id: ports.selfInstanceId,
          to_issuer: fromIssuer,
          purpose: 'federation.invite.ack',
          nonce: ports.newNonce(),
          nonce_echo: verified.nonce,
          iat: ports.now(),
          exp: ports.now() + 600,
        })
        return { state: row.state as FederationPeerState, ack_jws: ackJws, row }
      }

      case 'federation.confirm':
      case 'federation.invite.ack': {
        if (!row) throw FED.peerNotFound(`no peer for issuer ${fromIssuer}`)
        if (row.pendingNonce && verified.nonce_echo !== row.pendingNonce) {
          throw FED.nonceMismatch('confirm nonce_echo does not match pending_nonce')
        }
        if (row.state === 'invited' || row.state === 'pending') {
          const linked = await repo.linkFederatedTenant(row.federationPeerId, {
            tenantId: ports.newId('tn_'),
            slug: slugFromIssuer(fromIssuer),
            displayName: row.displayName ?? null,
            status: 'active',
            kind: 'federated',
            federationPeerId: row.federationPeerId,
          })
          row = linked.peer
        }
        return { state: row.state as FederationPeerState, row }
      }

      case 'federation.revoke': {
        if (!row) throw FED.peerNotFound(`no peer for issuer ${fromIssuer}`)
        const updated = await repo.revoke(row.federationPeerId, row.tenantId ?? null)
        return { state: 'revoked', row: updated }
      }

      case 'federation.suspend': {
        if (!row) throw FED.peerNotFound(`no peer for issuer ${fromIssuer}`)
        if (!isTransitionAllowed(row.state as FederationPeerState, 'suspended')) {
          throw FED.invalidTransition(`from ${row.state}`, { state: row.state })
        }
        const [updated] = await repo.update(row.federationPeerId, {
          state: 'suspended',
          suspendedAt: new Date(),
        })
        if (!updated) throw FED.remoteError('update returned no row')
        return { state: 'suspended', row: updated }
      }

      case 'federation.resume': {
        if (!row) throw FED.peerNotFound(`no peer for issuer ${fromIssuer}`)
        if (!isTransitionAllowed(row.state as FederationPeerState, 'trusted')) {
          throw FED.invalidTransition(`from ${row.state}`, { state: row.state })
        }
        const [updated] = await repo.update(row.federationPeerId, {
          state: 'trusted',
          suspendedAt: null,
        })
        if (!updated) throw FED.remoteError('update returned no row')
        return { state: 'trusted', row: updated }
      }

      default:
        throw FED.jwsVerifyFailed(`unsupported purpose: ${verified.purpose}`)
    }
  }

  /** Operator-initiated explicit state transition. Only trusted ⇄ suspended is allowed (revoke goes through DELETE). */
  const transitionPeer = async (
    id: string,
    target: FederationPeerState,
  ): Promise<FederationPeerView> => {
    const row = await repo.findById(id)
    if (!row) throw FED.peerNotFound(`fdp ${id}`)
    if (!isTransitionAllowed(row.state as FederationPeerState, target)) {
      throw FED.invalidTransition(
        `${row.state} → ${target} not allowed`,
        { from: row.state, to: target },
      )
    }
    if (target !== 'trusted' && target !== 'suspended') {
      throw FED.invalidTransition('admin transition limited to trusted ⇄ suspended', {
        attempted: target,
      })
    }
    const patch: Partial<typeof row> = { state: target }
    if (target === 'suspended') patch.suspendedAt = new Date()
    if (target === 'trusted' && row.state === 'suspended') patch.suspendedAt = null
    const [updated] = await repo.update(id, patch as never)
    if (!updated) throw FED.peerNotFound(`fdp ${id}`)
    return toPeerView(updated)
  }

  /** Operator-initiated permanent revoke. Best-effort notify the peer; local terminates unconditionally. */
  const revokePeer = async (id: string): Promise<void> => {
    const row = await repo.findById(id)
    if (!row) throw FED.peerNotFound(`fdp ${id}`)
    if (row.state === 'revoked') return // Idempotent

    // best-effort outbound revoke notification — local proceeds even on failure
    if (row.state === 'trusted' || row.state === 'suspended') {
      try {
        const jws = await ports.signHandshake({
          from_issuer: ports.selfIssuer,
          from_instance_id: ports.selfInstanceId,
          to_issuer: row.issuer,
          purpose: 'federation.revoke',
          nonce: ports.newNonce(),
          iat: ports.now(),
          exp: ports.now() + 600,
        })
        const url =
          (row.peerMetadata?.federation_handshake_url as string | undefined) ??
          `${row.issuer}/federation/handshake`
        await ports.fetcher(url, {
          method: 'POST',
          headers: { 'content-type': 'application/jws' },
          body: jws,
        })
      } catch {
        // Ignore — local revoke still proceeds
      }
    }

    await repo.revoke(id, row.tenantId ?? null)
  }

  const getPeer = async (id: string): Promise<FederationPeerView> => {
    const row = await repo.findById(id)
    if (!row) throw FED.peerNotFound(`fdp ${id}`)
    return toPeerView(row)
  }

  const listPeers = async (opts: {
    state?: FederationPeerState
    page: number
    limit: number
  }) => {
    const rows = await repo.list(opts)
    const total = await repo.count(opts.state)
    return {
      items: rows.map(toPeerView),
      meta: {
        total,
        page: opts.page,
        limit: opts.limit,
        has_next_page: opts.page * opts.limit < total,
      },
    }
  }

  const refreshJwks = async (id: string): Promise<FederationPeerView> => {
    const row = await repo.findById(id)
    if (!row) throw FED.peerNotFound(`fdp ${id}`)
    const discovery = await fetchPeerDiscovery(ports.fetcher, row.issuer)
    const jwks = await fetchPeerJwks(ports.fetcher, discovery.federation_jwks_url)
    const [updated] = await repo.update(id, {
      jwks,
      jwksCachedAt: new Date(),
      peerMetadata: discovery as unknown as Record<string, unknown>,
    })
    if (!updated) throw FED.peerNotFound(`fdp ${id}`)
    return toPeerView(updated)
  }

  return {
    addPeer,
    handleInbound,
    transitionPeer,
    revokePeer,
    getPeer,
    listPeers,
    refreshJwks,
  }
}

// ── helpers ──────────────────────────────────────────────────

/** issuer URL → tenant slug. `https://bob.example` → `bob.example`. */
export const slugFromIssuer = (issuer: string): string => {
  const u = new URL(issuer)
  return u.host
}

/**
 * Peek at `from_issuer` by base64url-decoding only the payload segment of a compact JWS.
 *
 * The value is **pre-signature-verification** and untrusted. Used only to look up the
 * peer JWKS; all trust decisions follow the payload returned after verify succeeds.
 */
export const peekFromIssuer = (
  compactJws: string,
): { from_issuer: string } | null => {
  const parts = compactJws.split('.')
  if (parts.length !== 3) return null
  try {
    const json = base64urlDecode(parts[1]!)
    const obj = JSON.parse(json) as { from_issuer?: unknown }
    if (typeof obj?.from_issuer !== 'string') return null
    return { from_issuer: obj.from_issuer }
  } catch {
    return null
  }
}

const base64urlDecode = (s: string): string => {
  const pad = s.length % 4 === 2 ? '==' : s.length % 4 === 3 ? '=' : ''
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad
  // Workers, browsers, and Node 20+ all expose globalThis.atob.
  return atob(b64)
}
