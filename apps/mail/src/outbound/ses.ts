// AWS SES v2 outbound provider.
//
// Signs requests with SigV4 via aws4fetch (Workers-native, ~3 KB, no AWS
// SDK). Targets the v2 SendEmail REST endpoint:
//   POST https://email.{region}.amazonaws.com/v2/email/outbound-emails
// Docs: https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html

import { AwsClient } from 'aws4fetch'
import type { MailSender, OutboundMessage } from '@citizenry/mail'

export type AwsSesConfig = {
  accessKeyId: string
  secretAccessKey: string
  region: string
  /** Optional STS session token for assumed-role / temporary credentials. */
  sessionToken?: string
}

export class AwsSesSender implements MailSender {
  readonly name = 'aws-ses'
  private readonly client: AwsClient
  private readonly endpoint: string

  constructor(cfg: AwsSesConfig) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      sessionToken: cfg.sessionToken,
      service: 'ses',
      region: cfg.region,
    })
    this.endpoint = `https://email.${cfg.region}.amazonaws.com/v2/email/outbound-emails`
  }

  async send(msg: OutboundMessage): Promise<{ providerMessageId: string | null }> {
    const body = {
      FromEmailAddress: formatAddress(msg.from),
      Destination: {
        ToAddresses: msg.to.map(formatAddress),
        CcAddresses: msg.cc?.map(formatAddress),
        BccAddresses: msg.bcc?.map(formatAddress),
      },
      ReplyToAddresses: msg.replyTo?.map(formatAddress),
      Content: {
        Simple: {
          Subject: { Data: msg.subject, Charset: 'UTF-8' },
          Body: {
            ...(msg.text ? { Text: { Data: msg.text, Charset: 'UTF-8' } } : {}),
            ...(msg.html ? { Html: { Data: msg.html, Charset: 'UTF-8' } } : {}),
          },
        },
      },
    }

    const res = await this.client.fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`AWS SES HTTP ${res.status}: ${text.slice(0, 400)}`)
    }
    try {
      const parsed = JSON.parse(text) as { MessageId?: string }
      return { providerMessageId: parsed.MessageId ?? null }
    } catch {
      return { providerMessageId: null }
    }
  }
}

function formatAddress(a: { name?: string; mail: string }): string {
  return a.name ? `${a.name} <${a.mail}>` : a.mail
}
