import type { Db } from '../db'
import { agentDid, issuerDid } from '../ids'
import { createAgentKeyRepo } from '../repo/agent_key'
import type { JwkOkpEd25519Published } from './jwks'

export type DidService = ReturnType<typeof createDidService>

export interface DidDocument {
  '@context': string[]
  id: string
  verificationMethod: VerificationMethod[]
  authentication: string[]
  assertionMethod: string[]
}

export interface VerificationMethod {
  id: string
  type: 'JsonWebKey2020'
  controller: string
  publicKeyJwk: JwkOkpEd25519Published
}

const DID_CONTEXT = [
  'https://www.w3.org/ns/did/v1',
  'https://w3id.org/security/suites/jws-2020/v1',
]

/**
 * DID Document builder.
 *
 * issuer: every active key as a verificationMethod.
 * agent: only the agent's active keys as verificationMethods.
 */
export const createDidService = (deps: { db: Db; issuerHost: string }) => {
  const keys = createAgentKeyRepo(deps.db)

  return {
    /** `/.well-known/did.json`. */
    issuer: async (): Promise<DidDocument> => {
      throw new Error('not implemented')
    },

    /** `/agent/{id}/did.json`. */
    agent: async (agentId: string): Promise<DidDocument> => {
      const active = await keys.findActiveByAgent(agentId)
      const did = agentDid(deps.issuerHost, agentId)

      const verificationMethod: VerificationMethod[] = active.map((k) => ({
        id: `${did}#${k.kid}`,
        type: 'JsonWebKey2020' as const,
        controller: did,
        publicKeyJwk: {
          kty: 'OKP' as const,
          crv: 'Ed25519' as const,
          alg: 'EdDSA' as const,
          use: 'sig' as const,
          x: Buffer.from(k.publicKey).toString('base64url'),
          kid: k.kid,
        },
      }))

      return {
        '@context': DID_CONTEXT,
        id: did,
        verificationMethod,
        authentication: verificationMethod.map((v) => v.id),
        assertionMethod: verificationMethod.map((v) => v.id),
      }
    },

    issuerId: () => issuerDid(deps.issuerHost),
  }
}
