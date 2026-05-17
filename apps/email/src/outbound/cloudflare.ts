// Cloudflare Email Service — native Workers binding (`[[send_email]]`).
//
// Public beta as of 2026-04-16. Requires the Worker's bound domain to be
// hosted on Cloudflare DNS; CF auto-configures SPF/DKIM/DMARC at domain
// add time. No API key management.
//
// Docs: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/

import type { EmailSender, OutboundMessage } from '@citizenry/email'
import type { SendEmail } from '@cloudflare/workers-types'

export class CloudflareEmailSender implements EmailSender {
  readonly name = 'cloudflare'

  constructor(private readonly binding: SendEmail) {}

  async send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }> {
    const res = await this.binding.send({
      from: { name: msg.from.name ?? '', email: msg.from.email },
      to: msg.to.map(formatAddress),
      cc: msg.cc?.map(formatAddress),
      bcc: msg.bcc?.map(formatAddress),
      replyTo: msg.replyTo?.[0]
        ? { name: msg.replyTo[0].name ?? '', email: msg.replyTo[0].email }
        : undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    })
    return { providerMessageId: res.messageId ?? null }
  }
}

function formatAddress(a: { name?: string; email: string }): string {
  return a.name ? `${a.name} <${a.email}>` : a.email
}
