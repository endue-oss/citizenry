// Outbound sender selection.
//
// Priority (highest first):
//   1. Cloudflare Email Service — native `[[send_email]]` binding on env.EMAIL.
//      No API key management; requires the sender domain on Cloudflare DNS.
//   2. Resend — env.RESEND_API_KEY. External provider, works on any DNS.
//   3. Log-only — records the call to Worker logs without delivering.
//      Lets the OSS scaffold run end-to-end without external credentials.

import type { EmailSender } from '@citizenry/email'
import type { SendEmail } from '@cloudflare/workers-types'
import { CloudflareEmailSender } from './cloudflare'
import { ResendSender, LogOnlySender } from './resend'

export { CloudflareEmailSender } from './cloudflare'
export { ResendSender, LogOnlySender } from './resend'

export function pickSender(env: {
  EMAIL?: SendEmail
  RESEND_API_KEY?: string
}): EmailSender {
  if (env.EMAIL) {
    return new CloudflareEmailSender(env.EMAIL)
  }
  if (env.RESEND_API_KEY && env.RESEND_API_KEY.length > 0) {
    return new ResendSender(env.RESEND_API_KEY)
  }
  return new LogOnlySender()
}
