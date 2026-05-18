// Outbound sender selection.
//
// Priority (highest first):
//   1. Cloudflare Email Service — native `[[send_email]]` binding on env.MAIL.
//      No API key management; requires the sender domain on Cloudflare DNS.
//   2. Resend — env.RESEND_API_KEY. External provider, works on any DNS.
//   3. AWS SES — env.AWS_SES_ACCESS_KEY_ID + AWS_SES_SECRET_ACCESS_KEY
//      (+ AWS_SES_REGION, default us-east-1; optional AWS_SES_SESSION_TOKEN).
//      For AWS-shop adopters or when SES is already verified for the domain.
//   4. Log-only — records the call to Worker logs without delivering.
//      Lets the OSS scaffold run end-to-end without external credentials.

import type { MailSender } from '@citizenry/mail'
import type { SendEmail } from '@cloudflare/workers-types'
import { CloudflareMailSender } from './cloudflare'
import { ResendSender, LogOnlySender } from './resend'
import { AwsSesSender } from './ses'

export { CloudflareMailSender } from './cloudflare'
export { ResendSender, LogOnlySender } from './resend'
export { AwsSesSender } from './ses'

export function pickSender(env: {
  MAIL?: SendEmail
  RESEND_API_KEY?: string
  AWS_SES_ACCESS_KEY_ID?: string
  AWS_SES_SECRET_ACCESS_KEY?: string
  AWS_SES_REGION?: string
  AWS_SES_SESSION_TOKEN?: string
}): MailSender {
  if (env.MAIL) {
    return new CloudflareMailSender(env.MAIL)
  }
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 0) {
    return new ResendSender(env.RESEND_API_KEY)
  }
  if (
    env.AWS_SES_ACCESS_KEY_ID &&
    env.AWS_SES_ACCESS_KEY_ID.length > 0 &&
    env.AWS_SES_SECRET_ACCESS_KEY &&
    env.AWS_SES_SECRET_ACCESS_KEY.length > 0
  ) {
    return new AwsSesSender({
      accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY,
      region: env.AWS_SES_REGION ?? 'us-east-1',
      sessionToken: env.AWS_SES_SESSION_TOKEN,
    })
  }
  return new LogOnlySender()
}
