import type { D1Database, Fetcher } from '@cloudflare/workers-types'

export type Bindings = {
  /** Service binding to the api worker. Routes admin-api → api inside
   *  Cloudflare's network — required because workers.dev disallows
   *  sibling fetch via public URLs (returns CF 1042). */
  API: Fetcher

  /** D1 binding — identity domain. Used for admin_refresh_token
   *  rotation bookkeeping. The admin password itself lives in
   *  DB_CONFIG. */
  DB_IDENTITY: D1Database

  /** D1 binding — config domain. Source of truth for the admin
   *  password (key `admin.password`) and any other runtime control-
   *  plane values. Read via packages/config's colo-local TTL cache. */
  DB_CONFIG: D1Database

  /** Optional path-builder hint. Production deploys leave it unset; the
   *  service binding ignores the URL host anyway, so only the path
   *  matters when constructing upstream requests. */
  API_BASE_URL?: string

  /** Default admin id baked into the deploy. */
  ADMIN_ID: string

  /** Access-token TTL in seconds. Stored as a string because wrangler
   *  vars are always strings. */
  ACCESS_TOKEN_TTL_SECS: string

  /** Service PSK — the X-Service-Key value admin-api sends to api.
   *  Must match api's SERVICE_KEY. */
  SERVICE_KEY: string

  /** HS256 secret used to sign / verify access tokens. Hex-encoded. */
  ADMIN_JWT_SECRET: string

  /** Pepper folded into refresh-token hashes. Hex-encoded. */
  ADMIN_REFRESH_PEPPER: string
}
