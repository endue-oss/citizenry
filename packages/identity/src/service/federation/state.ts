// federation_peer.state 전이표 — RFC-0001 §"State machine" 의 단일 진실 출처.

import type { FederationPeerState } from './types'

const ALLOWED: Record<FederationPeerState, ReadonlyArray<FederationPeerState>> = {
  invited: ['pending', 'trusted', 'revoked'],
  pending: ['trusted', 'revoked'],
  trusted: ['suspended', 'revoked'],
  suspended: ['trusted', 'revoked'],
  revoked: [],
}

/**
 * `from` 에서 `to` 로의 전이가 허용되는지 boolean 반환.
 * 동일 state 로의 self-transition 은 허용하지 않는다 (멱등은 호출자가 미리 처리).
 */
export const isTransitionAllowed = (
  from: FederationPeerState,
  to: FederationPeerState,
): boolean => ALLOWED[from].includes(to)

/** 가능한 다음 state 목록. UI / 디버깅용. */
export const allowedNextStates = (
  from: FederationPeerState,
): ReadonlyArray<FederationPeerState> => ALLOWED[from]

/** 종착(terminal) state. */
export const isTerminalState = (s: FederationPeerState): boolean => s === 'revoked'
