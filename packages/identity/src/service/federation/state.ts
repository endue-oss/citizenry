// State transition table for federation_peer.state — single source of truth
// for RFC-0001 §"State machine".

import type { FederationPeerState } from './types'

const ALLOWED: Record<FederationPeerState, ReadonlyArray<FederationPeerState>> = {
  invited: ['pending', 'trusted', 'revoked'],
  pending: ['trusted', 'revoked'],
  trusted: ['suspended', 'revoked'],
  suspended: ['trusted', 'revoked'],
  revoked: [],
}

/**
 * Whether a transition from `from` to `to` is allowed.
 * Self-transitions are not allowed — callers handle idempotency themselves.
 */
export const isTransitionAllowed = (
  from: FederationPeerState,
  to: FederationPeerState,
): boolean => ALLOWED[from].includes(to)

/** List of allowed next states. UI / debugging helper. */
export const allowedNextStates = (
  from: FederationPeerState,
): ReadonlyArray<FederationPeerState> => ALLOWED[from]

/** Terminal state. */
export const isTerminalState = (s: FederationPeerState): boolean => s === 'revoked'
