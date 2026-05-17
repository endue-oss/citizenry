// Resend and log-only outbound providers.
//
// Used when the higher-priority Cloudflare binding is unavailable.
// Selection priority lives in ./index.ts (pickSender).

import type { EmailSender, OutboundMessage } from '@citizenry/email'

export class ResendSender implements EmailSender {
  readonly name = 'resend'

  constructor(private readonly apiKey: string) {}

  async send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }> {
    const body = {
      from: formatAddress(msg.from),
      to: msg.to.map(formatAddress),
      cc: msg.cc?.map(formatAddress),
      bcc: msg.bcc?.map(formatAddress),
      reply_to: msg.replyTo?.map(formatAddress),
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Resend HTTP ${res.status}: ${text.slice(0, 400)}`)
    }
    try {
      const parsed = JSON.parse(text) as { id?: string }
      return { providerMessageId: parsed.id ?? null }
    } catch {
      return { providerMessageId: null }
    }
  }
}

export class LogOnlySender implements EmailSender {
  readonly name = 'log-only'

  async send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }> {
    // Worker logs go to wrangler tail / Cloudflare dashboard. Truncate the
    // body so we don't bloat logs with large mails.
    console.log(
      JSON.stringify({
        sender: 'log-only',
        to: msg.to.map((a) => a.email),
        from: msg.from.email,
        subject: msg.subject,
        text_len: msg.text?.length ?? 0,
        html_len: msg.html?.length ?? 0,
      }),
    )
    return { providerMessageId: null }
  }
}

function formatAddress(a: { name?: string; email: string }): string {
  return a.name ? `${a.name} <${a.email}>` : a.email
}
