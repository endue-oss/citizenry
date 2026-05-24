// Composite MailSender that walks an ordered chain of providers,
// falling back to the next one whenever a send throws. The chain always
// ends with LogOnlySender (which never throws), so send() resolves even
// when every credentialed provider is down.
//
// `name` reflects the provider that actually handled the most recent
// send(), so mail_outbound_log records the real sender — not "the chain".

import type { MailSender, OutboundMessage } from '@citizenry/mail'

export class FallbackSender implements MailSender {
  #chain: MailSender[]
  #lastUsed: string

  constructor(chain: MailSender[]) {
    if (chain.length === 0) {
      throw new Error('FallbackSender requires at least one provider')
    }
    this.#chain = chain
    this.#lastUsed = chain[0]!.name
  }

  get name(): string {
    return this.#lastUsed
  }

  async send(
    msg: OutboundMessage,
  ): Promise<{ providerMessageId: string | null }> {
    let lastErr: unknown
    for (const sender of this.#chain) {
      this.#lastUsed = sender.name
      try {
        return await sender.send(msg)
      } catch (err) {
        lastErr = err
        // Surfaced in wrangler tail / Cloudflare logs so operators can
        // see which provider failed before the fallback kicked in.
        console.warn(
          JSON.stringify({
            event: 'outbound_fallback',
            provider: sender.name,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
    }
    throw lastErr ?? new Error('no outbound provider succeeded')
  }
}
