import type { D1Database, SendEmail } from '@cloudflare/workers-types'

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
   * Cloudflare Email Service binding (`[[send_email]]` in wrangler.toml).
   * Highest-priority sender — when present, supersedes RESEND_API_KEY.
   */
  EMAIL?: SendEmail

  /**
   * Optional Resend API key. Used as fallback when EMAIL is not bound.
   * If neither is configured, the Worker uses a log-only sender that
   * records outbound rows but does not actually deliver email.
   */
  RESEND_API_KEY?: string
}
