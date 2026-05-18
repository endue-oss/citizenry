// Cloudflare Email Service — native Workers binding (`[[send_email]]`).
//
// Public beta as of 2026-04-16. Requires the Worker's bound domain to be
// hosted on Cloudflare DNS; CF auto-configures SPF/DKIM/DMARC at domain
// add time. No API key management.
//
// Docs: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/

import type { MailSender, OutboundMessage } from '@citizenry/mail'
import type { SendEmail } from '@cloudflare/workers-types'

export class CloudflareMailSender implements MailSender {
  readonly name = 'cloudflare'

  constructor(private readonly binding: SendEmail) {}

  async send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }> {
    const res = await this.binding.send({
      from: { name: msg.from.name ?? '', email: msg.from.mail },
      to: msg.to.map(formatAddress),
      cc: msg.cc?.map(formatAddress),
      bcc: msg.bcc?.map(formatAddress),
      replyTo: msg.replyTo?.[0]
        ? { name: msg.replyTo[0].name ?? '', email: msg.replyTo[0].mail }
        : undefined,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    })
    return { providerMessageId: res.messageId ?? null }
  }
}

function formatAddress(a: { name?: string; mail: string }): string {
  return a.name ? `${a.name} <${a.mail}>` : a.mail
}
