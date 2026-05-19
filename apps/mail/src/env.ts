import type { D1Database, SendEmail } from '@cloudflare/workers-types'

export type Bindings = {
  /** D1 — identity domain. Used solely to verify Bearer JWTs (`agent_key`). */
  DB_IDENTITY: D1Database
  /** D1 — mail domain. */
  DB_MAIL: D1Database
  /** D1 — config domain. Holds outbound provider credentials and other
   *  runtime config. Writes go through admin api `/_admin/*`. */
  DB_CONFIG: D1Database

  /** Comma-separated JWT `aud` values this Worker accepts. */
  JWT_AUDIENCE: string
  /** Outbound default-From host. */
  MAIL_DOMAIN: string

  /**
   * Pre-shared key used to gate `/_internal/notify` from other Workers
   * (api / admin-api). Same value api / admin-api already hold for
   * X-Service-Key against api `/_admin/*`. See ADR-2026-0005.
   */
  SERVICE_KEY: string

  /**
   * Cloudflare Email Service binding (`[[send_email]]` in wrangler.toml).
   * Highest-priority sender — when present, supersedes config-backed
   * providers. Wrangler binding, not a credential, so it stays on env.
   */
  MAIL?: SendEmail
}
