import type { Db } from '../db'
import { agentDid, issuerDid } from '../ids'
import { createAgentKeyRepo, type AgentKeyRepo } from '../repo/agent_key'
import type { PublishedJwk } from './jwks'
import { bytesToBase64url } from '../jose'

export type DidService = ReturnType<typeof createDidService>

export interface DidDocument {
  '@context': string[]
  id: string
  verificationMethod: VerificationMethod[]
  authentication: string[]
  assertionMethod: string[]
  keyAgreement: string[]
}

export interface VerificationMethod {
  id: string
  type: 'JsonWebKey2020'
  controller: string
  publicKeyJwk: PublishedJwk
}

const DID_CONTEXT = [
  'https://www.w3.org/ns/did/v1',
  'https://w3id.org/security/suites/jws-2020/v1',
]

/**
 * DID Document builder.
 *
 * issuer: the instance-level document (federation signing keys).
 * agent: only the agent's active keys as verificationMethods.
 */
export const createDidService = (deps: {
  db: Db
  issuerHost: string
  /** Inject for tests; defaults to the D1-backed repo over `db`. */
  keys?: AgentKeyRepo
}) => {
  const keys = deps.keys ?? createAgentKeyRepo(deps.db)

  return {
    /**
     * `/.well-known/did.json` — the instance document. Its
     * verificationMethods are the instance-level federation signing
     * keys; their issuance is not built yet (the same gap that keeps
     * `/.well-known/jwks.json` empty), so the method set is empty for
     * now. The document id already follows the configured issuer host.
     */
    issuer: async (): Promise<DidDocument> => {
      const did = issuerDid(deps.issuerHost)
      return {
        '@context': DID_CONTEXT,
        id: did,
        verificationMethod: [],
        authentication: [],
        assertionMethod: [],
        keyAgreement: [],
      }
    },

    /** `/agent/{id}/did.json`. */
    agent: async (agentId: string): Promise<DidDocument> => {
      const [sigActive, encActive] = await Promise.all([
        keys.findActiveByAgent(agentId),
        keys.findActiveEncByAgent(agentId),
      ])
      const did = agentDid(deps.issuerHost, agentId)

      const sigMethods: VerificationMethod[] = sigActive.map((k) => ({
        id: `${did}#${k.kid}`,
        type: 'JsonWebKey2020' as const,
        controller: did,
        publicKeyJwk: {
          kty: 'OKP' as const,
          crv: 'Ed25519' as const,
          alg: 'EdDSA' as const,
          use: 'sig' as const,
          x: bytesToBase64url(k.publicKey),
          kid: k.kid,
        },
      }))

      const encMethods: VerificationMethod[] = encActive.map((k) => ({
        id: `${did}#${k.kid}`,
        type: 'JsonWebKey2020' as const,
        controller: did,
        publicKeyJwk: {
          kty: 'OKP' as const,
          crv: 'X25519' as const,
          use: 'enc' as const,
          x: bytesToBase64url(k.publicKey),
          kid: k.kid,
        },
      }))

      return {
        '@context': DID_CONTEXT,
        id: did,
        verificationMethod: [...sigMethods, ...encMethods],
        authentication: sigMethods.map((v) => v.id),
        assertionMethod: sigMethods.map((v) => v.id),
        keyAgreement: encMethods.map((v) => v.id),
      }
    },

    issuerId: () => issuerDid(deps.issuerHost),
  }
}
