// Outbound sender selection.
//
// Priority (highest first):
//   1. Cloudflare Email Service — native `[[send_email]]` binding on env.MAIL.
//      Wrangler binding, not a credential, so it stays on env.
//   2. Resend — config key `mail.outbound.resend.api_key`.
//   3. AWS SES — config keys `mail.outbound.aws_ses.access_key_id` +
//      `mail.outbound.aws_ses.secret_access_key`
//      (+ optional `.region`, default us-east-1; optional `.session_token`).
//   4. Log-only — records the call to Worker logs without delivering.
//      Lets the OSS scaffold run end-to-end without external credentials.
//
// Credentials live in the config D1 (read via the colo-local cached
// reader, 5-min TTL) so an operator can activate / rotate / disable a
// provider through the admin API without redeploying the Worker.

import type { MailSender } from '@citizenry/mail'
import type { ConfigReader } from '@citizenry/config'
import type { SendEmail } from '@cloudflare/workers-types'
import { CloudflareMailSender } from './cloudflare'
import { ResendSender, LogOnlySender } from './resend'
import { AwsSesSender } from './ses'

export { CloudflareMailSender } from './cloudflare'
export { ResendSender, LogOnlySender } from './resend'
export { AwsSesSender } from './ses'

export const CONFIG_KEYS = {
  resendApiKey: 'mail.outbound.resend.api_key',
  sesAccessKeyId: 'mail.outbound.aws_ses.access_key_id',
  sesSecretAccessKey: 'mail.outbound.aws_ses.secret_access_key',
  sesRegion: 'mail.outbound.aws_ses.region',
  sesSessionToken: 'mail.outbound.aws_ses.session_token',
} as const

async function readString(config: ConfigReader, key: string): Promise<string | null> {
  const entry = await config.get<string>(key)
  if (!entry) return null
  const v = entry.value
  return typeof v === 'string' && v.length > 0 ? v : null
}

export async function pickSender(
  env: { MAIL?: SendEmail },
  config: ConfigReader,
): Promise<MailSender> {
  if (env.MAIL) {
    return new CloudflareMailSender(env.MAIL)
  }

  const resendKey = await readString(config, CONFIG_KEYS.resendApiKey)
  if (resendKey) {
    return new ResendSender(resendKey)
  }

  const sesAccessKeyId = await readString(config, CONFIG_KEYS.sesAccessKeyId)
  const sesSecretAccessKey = await readString(config, CONFIG_KEYS.sesSecretAccessKey)
  if (sesAccessKeyId && sesSecretAccessKey) {
    const region = (await readString(config, CONFIG_KEYS.sesRegion)) ?? 'us-east-1'
    const sessionToken = (await readString(config, CONFIG_KEYS.sesSessionToken)) ?? undefined
    return new AwsSesSender({
      accessKeyId: sesAccessKeyId,
      secretAccessKey: sesSecretAccessKey,
      region,
      sessionToken,
    })
  }

  return new LogOnlySender()
}
