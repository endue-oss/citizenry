// Outbound sender selection.
//
// Providers, by id:
//   - `cloudflare` — native `[[send_email]]` binding on env.MAIL. A
//     wrangler binding, not a credential, so it stays on env.
//   - `resend` — config key `mail.outbound.resend.api_key`.
//   - `aws_ses` — config keys `mail.outbound.aws_ses.access_key_id` +
//     `mail.outbound.aws_ses.secret_access_key`
//     (+ optional `.region`, default us-east-1; optional `.session_token`).
//
// The order in which they're tried is operator-controlled via the config
// key `mail.outbound.priority` (a JSON array of provider ids), editable
// from admin-web. `buildSender` assembles every *available* provider in
// that order into a FallbackSender: the first provider handles a send,
// and a hard failure falls through to the next. LogOnlySender is always
// appended last — it never throws, so the OSS scaffold runs end-to-end
// without external credentials.
//
// Credentials and the priority list live in the config D1 (read via the
// colo-local cached reader, 5-min TTL) so an operator can activate /
// rotate / reorder providers through the admin API without redeploying.

import type { MailSender } from '@citizenry/mail'
import type { ConfigReader } from '@citizenry/config'
import type { SendEmail } from '@cloudflare/workers-types'
import { CloudflareMailSender } from './cloudflare'
import { ResendSender, LogOnlySender } from './resend'
import { AwsSesSender } from './ses'
import { GoogleGmailSender } from './google'
import { FallbackSender } from './fallback'

export { CloudflareMailSender } from './cloudflare'
export { ResendSender, LogOnlySender } from './resend'
export { AwsSesSender } from './ses'
export { GoogleGmailSender } from './google'
export { FallbackSender } from './fallback'

export const CONFIG_KEYS = {
  resendApiKey: 'mail.outbound.resend.api_key',
  sesAccessKeyId: 'mail.outbound.aws_ses.access_key_id',
  sesSecretAccessKey: 'mail.outbound.aws_ses.secret_access_key',
  sesRegion: 'mail.outbound.aws_ses.region',
  sesSessionToken: 'mail.outbound.aws_ses.session_token',
  googleClientEmail: 'mail.outbound.google.client_email',
  googlePrivateKey: 'mail.outbound.google.private_key',
  googleSender: 'mail.outbound.google.sender',
} as const

/** Config key holding the operator's provider priority order. */
export const PRIORITY_KEY = 'mail.outbound.priority'

/** Reorderable providers. LogOnly is implicit and always terminal. */
export type ProviderId = 'cloudflare' | 'resend' | 'aws_ses' | 'google'
export const DEFAULT_PRIORITY: ProviderId[] = [
  'cloudflare',
  'resend',
  'aws_ses',
  'google',
]
const KNOWN_PROVIDERS = new Set<string>(DEFAULT_PRIORITY)

async function readString(config: ConfigReader, key: string): Promise<string | null> {
  const entry = await config.get<string>(key)
  if (!entry) return null
  const v = entry.value
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Resolve the configured priority order. Unknown / duplicate ids are
 * dropped; any known provider missing from the stored list is appended
 * in the default order, so a partial config still covers everything.
 */
export async function readPriority(config: ConfigReader): Promise<ProviderId[]> {
  const entry = await config.get<unknown>(PRIORITY_KEY)
  const order: ProviderId[] = []
  const raw = entry?.value
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === 'string' && KNOWN_PROVIDERS.has(v) && !order.includes(v as ProviderId)) {
        order.push(v as ProviderId)
      }
    }
  }
  for (const id of DEFAULT_PRIORITY) {
    if (!order.includes(id)) order.push(id)
  }
  return order
}

/** Instantiate one provider if its credentials / binding are present. */
async function providerFor(
  id: ProviderId,
  env: { MAIL?: SendEmail },
  config: ConfigReader,
): Promise<MailSender | null> {
  switch (id) {
    case 'cloudflare':
      return env.MAIL ? new CloudflareMailSender(env.MAIL) : null
    case 'resend': {
      const key = await readString(config, CONFIG_KEYS.resendApiKey)
      return key ? new ResendSender(key) : null
    }
    case 'aws_ses': {
      const accessKeyId = await readString(config, CONFIG_KEYS.sesAccessKeyId)
      const secretAccessKey = await readString(config, CONFIG_KEYS.sesSecretAccessKey)
      if (!accessKeyId || !secretAccessKey) return null
      const region = (await readString(config, CONFIG_KEYS.sesRegion)) ?? 'us-east-1'
      const sessionToken = (await readString(config, CONFIG_KEYS.sesSessionToken)) ?? undefined
      return new AwsSesSender({ accessKeyId, secretAccessKey, region, sessionToken })
    }
    case 'google': {
      const clientEmail = await readString(config, CONFIG_KEYS.googleClientEmail)
      const privateKey = await readString(config, CONFIG_KEYS.googlePrivateKey)
      const sender = await readString(config, CONFIG_KEYS.googleSender)
      if (!clientEmail || !privateKey || !sender) return null
      return new GoogleGmailSender({ clientEmail, privateKey, sender })
    }
  }
}

/**
 * Build the active outbound sender: every available provider assembled
 * in the configured priority order, wrapped so a failure falls through
 * to the next. LogOnly is always the terminal fallback.
 */
export async function buildSender(
  env: { MAIL?: SendEmail },
  config: ConfigReader,
): Promise<MailSender> {
  const order = await readPriority(config)
  const chain: MailSender[] = []
  for (const id of order) {
    const sender = await providerFor(id, env, config)
    if (sender) chain.push(sender)
  }
  chain.push(new LogOnlySender())
  return new FallbackSender(chain)
}
