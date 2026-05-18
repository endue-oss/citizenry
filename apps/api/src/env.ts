import type { D1Database } from '@cloudflare/workers-types'

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

  /** Service key — value checked against the X-Service-Key header on `/_admin/*` routes. Sent by admin-api. */
  SERVICE_KEY: string
}
