import type { D1Database, Fetcher } from '@cloudflare/workers-types'

export type Bindings = {
  /** D1 binding — identity domain */
  DB_IDENTITY: D1Database

  /** D1 binding — vault domain */
  DB_VAULT: D1Database

  /** D1 binding — config domain (runtime control plane) */
  DB_CONFIG: D1Database

  /** JWT verification audience (e.g. "api.citizenry.id,citizenry-id") */
  JWT_AUDIENCE: string

  /** Pepper for the enrollment token peppered hash */
  ENROLLMENT_PEPPER: string

  /** Issuer host — DID builder (`did:web:{ISSUER_HOST}`) */
  ISSUER_HOST: string

  /**
   * Public base URL of this API Worker (e.g. `https://api.citizenry.id`).
   * Used to build the verification magic-link embedded in outbound
   * emails. Defaults to `https://{ISSUER_HOST}` when unset.
   */
  API_BASE_URL?: string

  /**
   * Service key — shared PSK. Used both as inbound X-Service-Key on
   * `/_admin/*` (from admin-api) and outbound on `MAIL_WORKER`'s
   * `/_internal/notify` route. See ADR-2026-0005.
   */
  SERVICE_KEY: string

  /**
   * Service binding to the citizenry-mail Worker. Used to dispatch
   * system-initiated outbound mail (human verification, future
   * enrollment / agent notifications). See ADR-2026-0005.
   */
  MAIL_WORKER: Fetcher
}
