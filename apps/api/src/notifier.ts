// Thin client for the mail Worker's privileged `/_internal/notify`
// route. Wraps the service-binding fetch with the shared PSK header
// and a typed contract. See ADR-2026-0005.

import type { Bindings } from './env'

export type NotifyArgs = {
  template: 'human_verification' | 'human_api_key'
  to: Array<{ name?: string; mail: string }>
  context: Record<string, unknown>
  /** Optional From envelope override. */
  from?: { name?: string; mail: string }
}

export type NotifyResult = {
  outbound_log_id: string
  status: 'queued' | 'sent' | 'failed' | 'invalid_request'
  provider_message_id: string | null
  sender_name: string
  error_message: string | null
}

/**
 * Result envelope returned to the caller. `delivered` is true only
 * when the provider acknowledged the send. Any other state still
 * persists an audit row in `mail_outbound_log`.
 */
export type Notifier = {
  send(args: NotifyArgs): Promise<NotifyResult & { delivered: boolean }>
}

export function createNotifier(env: Bindings): Notifier {
  return {
    async send(args) {
      const res = await env.MAIL_WORKER.fetch('https://internal/_internal/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': env.SERVICE_KEY,
          'X-Caller': 'citizenry-api',
        },
        body: JSON.stringify(args),
      })
      const body = (await res.json()) as NotifyResult
      return { ...body, delivered: body.status === 'sent' }
    },
  }
}
