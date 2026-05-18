import type { D1Database, SendEmail } from '@cloudflare/workers-types'

export type Bindings = {
  /** D1 — identity domain. Used solely to verify Bearer JWTs (`agent_key`). */
  DB_IDENTITY: D1Database
  /** D1 — mail domain. */
  DB_MAIL: D1Database
  /** D1 — config domain. Read-only; writes go through api `/_admin/*`. */
  DB_CONFIG: D1Database

  /** Comma-separated JWT `aud` values this Worker accepts. */
  JWT_AUDIENCE: string
  /** Outbound default-From host. */
  MAIL_DOMAIN: string

  /**
   * Cloudflare Email Service binding (`[[send_email]]` in wrangler.toml).
   * Highest-priority sender — when present, supersedes RESEND_API_KEY.
   */
  MAIL?: SendEmail

  /**
   * Optional Resend API key. Used as fallback when MAIL is not bound.
   */
  RESEND_API_KEY?: string

  /**
   * Optional AWS SES credentials. Used as fallback when neither MAIL
   * nor RESEND_API_KEY are configured. Both access key and secret are
   * required; region defaults to us-east-1; session token is optional
   * (set when using STS assumed-role / temporary credentials).
   *
   * If none of the above are set, the Worker uses a log-only sender
   * that records outbound rows but does not actually deliver mail.
   */
  AWS_SES_ACCESS_KEY_ID?: string
  AWS_SES_SECRET_ACCESS_KEY?: string
  AWS_SES_REGION?: string
  AWS_SES_SESSION_TOKEN?: string
}
