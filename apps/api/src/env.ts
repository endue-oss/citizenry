import type { D1Database, Hyperdrive } from '@cloudflare/workers-types'

export type Bindings = {
  /** Hyperdrive binding — origin Postgres (identity 도메인) */
  HYPERDRIVE: Hyperdrive

  /** D1 binding — vault 도메인 */
  DB_VAULT: D1Database

  /** JWT 검증 audience (e.g. "api.citizenry.id,citizenry-id") */
  JWT_AUDIENCE: string

  /** Enrollment token peppered hash 의 pepper */
  ENROLLMENT_PEPPER: string

  /** Issuer host — DID 빌더 (`did:web:{ISSUER_HOST}`) */
  ISSUER_HOST: string
}
