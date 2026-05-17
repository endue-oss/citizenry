// Wire + domain types shared between federation modules.
// Mirrors spec/identity/federation.tsp models, exposed at the
// `@citizenry/identity` package boundary for downstream consumers.

export type FederationPeerState =
  | 'invited'
  | 'pending'
  | 'trusted'
  | 'suspended'
  | 'revoked'

export type FederationPurpose =
  | 'federation.invite'
  | 'federation.invite.ack'
  | 'federation.confirm'
  | 'federation.confirm.ack'
  | 'federation.revoke'
  | 'federation.suspend'
  | 'federation.resume'

/** Compact JWS payload for handshake/revoke. RFC-0001 §"Wire format". */
export interface FederationHandshakePayload {
  from_issuer: string
  from_instance_id: string
  to_issuer: string
  purpose: FederationPurpose
  display_name?: string
  nonce: string
  nonce_echo?: string
  iat: number
  exp: number
  metadata?: Record<string, unknown>
}

/** `/.well-known/citizenry-peer` 응답 모양. */
export interface PeerDiscoveryDocument {
  protocol_version: number
  issuer: string
  instance_id: string
  display_name?: string
  federation_jwks_url: string
  federation_handshake_url: string
  policies?: {
    auto_accept?: boolean
    max_peers?: number
  }
}

/** Admin GET 응답 모양. DB row → view 변환. */
export interface FederationPeerView {
  id: string
  issuer: string
  instance_id?: string
  display_name?: string
  state: FederationPeerState
  protocol_version: number
  tenant_id?: string
  peer_metadata?: Record<string, unknown>
  jwks_cached_at?: string
  trusted_at?: string
  suspended_at?: string
  revoked_at?: string
  created_at: string
  updated_at: string
}
