import type { D1Database } from '@cloudflare/workers-types'

export type Bindings = {
  /** D1 — identity domain. Used solely to verify Bearer JWTs (`agent_key`). */
  DB_IDENTITY: D1Database
  /** D1 — email domain. */
  DB_EMAIL: D1Database

  /** Comma-separated JWT `aud` values this Worker accepts. */
  JWT_AUDIENCE: string
  /** Outbound default-From host. */
  EMAIL_DOMAIN: string

  /**
   * Optional: provider key for Resend. When unset, the Worker uses a
   * log-only sender that records outbound rows but does not actually
   * deliver email.
   */
  RESEND_API_KEY?: string
}
