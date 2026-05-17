// Federation service — admin CRUD + inbound handshake handler.
//
// Side-effects (HTTP outbound, ULID 생성, 시간) 는 모두 ports 로 주입한다.
// 이렇게 하면 service 는 결정론적 — 테스트가 mock repo + fake ports 만으로 통과.

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
  /** ULID + prefix 생성기. */
  newId: (prefix: 'fdp_' | 'tn_') => string

  /** 32B base64url nonce 생성. */
  newNonce: () => string

  /** outbound HTTP fetch — undici / global `fetch` / fake. */
  fetcher: Fetcher

  /** compact JWS 검증기 (peer JWKS 기반 EdDSA). */
  jwsVerifier: JwsVerifier

  /**
   * 우리 인스턴스가 nonce 까지 직접 채워 JWS 를 만들어 보낼 때 호출.
   * 키 관리는 service 외부 책임이므로 ports 로 주입.
   */
  signHandshake: (payload: FederationHandshakePayload) => Promise<string>

  /** 우리 인스턴스의 issuer URL — 핸드셰이크 검증의 `to_issuer` 매칭에 사용. */
  selfIssuer: string

  /** 우리 인스턴스의 instance_id (`ci_*`). */
  selfInstanceId: string

  /** epoch seconds. 테스트가 시간을 고정하려면 주입. */
  now: () => number
}

export type FederationService = ReturnType<typeof createFederationService>

export const createFederationService = (
  repo: FederationPeerRepo,
  ports: FederationServicePorts,
) => {
  /** 운영자가 새 peer 추가 — 외부 fetch + outbound 핸드셰이크 시작. */
  const addPeer = async (input: {
    issuer_url: string
    display_name?: string
  }): Promise<FederationPeerView> => {
    const issuer = normalizeIssuer(input.issuer_url)

    // 1) 같은 issuer 로 살아있는 peer 있는지 확인
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

    // 3) row INSERT — state='invited', pending_nonce 채움
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

    // 4) outbound invite — best-effort. 실패 시 row 는 invited 상태로 유지.
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
      // 응답이 ack JWS 를 포함하면 verify 후 trusted 로 전이.
      // (MVP: 응답이 JSON 인 경우만 처리; pure-JWS 응답은 다음 라운드에서 confirm 받음.)
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
          // trusted 로 전이 + federated tenant materialize
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
        // JSON parse 실패는 무시 — pending 으로 유지
      }
    } catch (e) {
      if ((e as { code?: string })?.code?.startsWith('ERR-P01-FED-')) throw e
      throw FED.remoteError(
        e instanceof Error ? e.message : 'outbound handshake failed',
        { issuer },
      )
    }

    return toPeerView(inserted)
  }

  /** Inbound 핸드셰이크 — peer 가 POST /federation/handshake 호출 시. */
  const handleInbound = async (
    compactJws: string,
  ): Promise<{ state: FederationPeerState; ack_jws?: string; row: FederationPeerRow }> => {
    // JWS payload 의 from_issuer 를 먼저 unsafely 파싱해서 (verify 전!) peer 를 조회 —
    // 잘못된 payload 면 verifyHandshakeJws 가 어쨌든 던지므로 safe.
    const peeked = peekFromIssuer(compactJws)
    if (!peeked) {
      throw FED.jwsVerifyFailed('JWS payload not parseable')
    }
    const fromIssuer = normalizeIssuer(peeked.from_issuer)

    // peer JWKS — 기존 row 가 있으면 cached, 없으면 discovery 로 fetch.
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

    // purpose 별 분기
    switch (verified.purpose) {
      case 'federation.invite': {
        if (row && row.state !== 'invited' && row.state !== 'pending') {
          // 이미 trusted/suspended 면 새 invite 거부 (재가입은 DELETE 후 새로)
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
          row = inserted
        } else {
          const [updated] = await repo.update(row.federationPeerId, {
            instanceId: verified.from_instance_id,
            displayName: verified.display_name ?? row.displayName,
            pendingNonce: verified.nonce,
            pendingNonceExp: new Date(verified.exp * 1000),
          })
          row = updated
        }

        // 즉시 ack — invite.ack JWS 동봉
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
        return { state: 'trusted', row: updated }
      }

      default:
        throw FED.jwsVerifyFailed(`unsupported purpose: ${verified.purpose}`)
    }
  }

  /** 운영자가 명시적으로 state 전이. trusted ⇄ suspended 만 허용 (revoke 는 DELETE). */
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
    return toPeerView(updated)
  }

  /** 운영자 영구 폐기. peer 에게 best-effort 통보, 로컬은 무조건 종료. */
  const revokePeer = async (id: string): Promise<void> => {
    const row = await repo.findById(id)
    if (!row) throw FED.peerNotFound(`fdp ${id}`)
    if (row.state === 'revoked') return // 멱등

    // best-effort outbound revoke 통보 — 실패해도 로컬 진행
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
        // 무시 — local revoke 는 진행
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
 * compact JWS 의 payload 부분만 base64url-decode 해서 `from_issuer` peek.
 *
 * **서명 검증 전** 의 신뢰할 수 없는 값. peer JWKS 를 조회하기 위한 용도로만 쓰며,
 * 모든 신뢰 결정은 verify 통과 후 payload 를 따른다.
 */
export const peekFromIssuer = (
  compactJws: string,
): { from_issuer: string } | null => {
  const parts = compactJws.split('.')
  if (parts.length !== 3) return null
  try {
    const json = base64urlDecode(parts[1])
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
  // atob 는 Workers 환경 표준.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = (globalThis as any).atob as (s: string) => string
  return a ? a(b64) : Buffer.from(b64, 'base64').toString('utf8')
}
