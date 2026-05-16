import type { D1Database, Hyperdrive } from '@cloudflare/workers-types'

export type Bindings = {
  /** Hyperdrive binding — origin Postgres (identity 도메인) */
  HYPERDRIVE: Hyperdrive

  /** D1 binding — vault 도메인 */
  DB_VAULT: D1Database

  /** Service PSK — admin endpoints `X-Service-Key` 검증 */
  SERVICE_KEY: string

  /** Enrollment token peppered hash 의 pepper */
  ENROLLMENT_PEPPER: string

  /** Issuer host — DID 빌더 */
  ISSUER_HOST: string

  /** Admin actor allowlist (선택, comma-separated) */
  ADMIN_ALLOWLIST?: string
}
