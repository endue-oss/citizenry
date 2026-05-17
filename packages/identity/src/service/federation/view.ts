// federation_peer DB row → public view 변환.

import type { FederationPeerRow } from '../../db/schema'
import type { FederationPeerState, FederationPeerView } from './types'

const isoOrUndef = (d: Date | string | null | undefined): string | undefined => {
  if (!d) return undefined
  if (typeof d === 'string') return d
  return d.toISOString()
}

export const toPeerView = (row: FederationPeerRow): FederationPeerView => ({
  id: row.federationPeerId,
  issuer: row.issuer,
  instance_id: row.instanceId ?? undefined,
  display_name: row.displayName ?? undefined,
  state: row.state as FederationPeerState,
  protocol_version: row.protocolVersion,
  tenant_id: row.tenantId ?? undefined,
  peer_metadata: row.peerMetadata,
  jwks_cached_at: isoOrUndef(row.jwksCachedAt),
  trusted_at: isoOrUndef(row.trustedAt),
  suspended_at: isoOrUndef(row.suspendedAt),
  revoked_at: isoOrUndef(row.revokedAt),
  created_at: new Date(row.createdAt as unknown as string).toISOString(),
  updated_at: new Date(row.updatedAt as unknown as string).toISOString(),
})
