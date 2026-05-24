// Google Workspace (Gmail API) outbound provider.
//
// Uses a service account with domain-wide delegation — no interactive
// OAuth. Each send: sign an RS256 JWT (WebCrypto) asserting the service
// account impersonating `sender`, exchange it for an access token at
// oauth2.googleapis.com, then POST the RFC822 message (base64url) to the
// Gmail API. All HTTPS + WebCrypto, so it runs on Workers exactly like
// the SES SigV4 path.
//
// Config keys (config D1):
//   mail.outbound.google.client_email — service account address (iss)
//   mail.outbound.google.private_key  — service account PEM (PKCS#8)
//   mail.outbound.google.sender       — Workspace user to impersonate (sub)
//
// Setup (one-time, outside citizenry): create the service account in GCP,
// then authorize its client id for the `gmail.send` scope under
// Admin console → Security → API controls → Domain-wide delegation.
// The `sender` must be a real Workspace user; From must be that user or
// one of its configured send-as aliases.

import type { MailSender, OutboundMessage } from '@citizenry/mail'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer'

export type GoogleConfig = {
  clientEmail: string
  privateKey: string
  sender: string
}

export class GoogleGmailSender implements MailSender {
  readonly name = 'google'

  constructor(private readonly cfg: GoogleConfig) {}

  async send(
    msg: OutboundMessage,
  ): Promise<{ providerMessageId: string | null }> {
    const token = await this.accessToken()
    const raw = base64url(new TextEncoder().encode(buildMime(msg)))

    const res = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    })

    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Gmail API HTTP ${res.status}: ${text.slice(0, 400)}`)
    }
    try {
      const parsed = JSON.parse(text) as { id?: string }
      return { providerMessageId: parsed.id ?? null }
    } catch {
      return { providerMessageId: null }
    }
  }

  /** Sign a service-account JWT and exchange it for an access token. */
  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const header = { alg: 'RS256', typ: 'JWT' }
    const claims = {
      iss: this.cfg.clientEmail,
      sub: this.cfg.sender,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }
    const unsigned = `${b64urlString(JSON.stringify(header))}.${b64urlString(JSON.stringify(claims))}`
    const key = await importPrivateKey(this.cfg.privateKey)
    const sig = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(unsigned),
    )
    const assertion = `${unsigned}.${base64url(new Uint8Array(sig))}`

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: JWT_BEARER, assertion }),
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Google token HTTP ${res.status}: ${text.slice(0, 400)}`)
    }
    const json = JSON.parse(text) as { access_token?: string }
    if (!json.access_token) {
      throw new Error('Google token response missing access_token')
    }
    return json.access_token
  }
}

// ── MIME ─────────────────────────────────────────────────────────────

function buildMime(msg: OutboundMessage): string {
  const headers: string[] = [
    `From: ${formatAddress(msg.from)}`,
    `To: ${msg.to.map(formatAddress).join(', ')}`,
  ]
  if (msg.cc?.length) headers.push(`Cc: ${msg.cc.map(formatAddress).join(', ')}`)
  if (msg.bcc?.length) headers.push(`Bcc: ${msg.bcc.map(formatAddress).join(', ')}`)
  if (msg.replyTo?.length) {
    headers.push(`Reply-To: ${msg.replyTo.map(formatAddress).join(', ')}`)
  }
  headers.push(`Subject: ${encodeHeaderWord(msg.subject)}`)
  headers.push('MIME-Version: 1.0')

  let body: string
  if (msg.html && msg.text) {
    const boundary = `b_${crypto.randomUUID().replace(/-/g, '')}`
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    body =
      `--${boundary}\r\n${part('text/plain', msg.text)}\r\n` +
      `--${boundary}\r\n${part('text/html', msg.html)}\r\n` +
      `--${boundary}--`
  } else if (msg.html) {
    headers.push('Content-Type: text/html; charset="UTF-8"')
    headers.push('Content-Transfer-Encoding: base64')
    body = b64(msg.html)
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"')
    headers.push('Content-Transfer-Encoding: base64')
    body = b64(msg.text ?? '')
  }

  return `${headers.join('\r\n')}\r\n\r\n${body}`
}

function part(mime: string, content: string): string {
  return (
    `Content-Type: ${mime}; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n${b64(content)}`
  )
}

function formatAddress(a: { name?: string; mail: string }): string {
  if (!a.name) return a.mail
  // Quote the display name and escape embedded quotes/backslashes.
  const escaped = a.name.replace(/(["\\])/g, '\\$1')
  return `"${escaped}" <${a.mail}>`
}

/** RFC 2047 encode a header value when it contains non-ASCII. */
function encodeHeaderWord(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s
  return `=?UTF-8?B?${b64(s)}?=`
}

// ── encoding / key helpers ───────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Standard base64 of a UTF-8 string (MIME bodies / encoded-words). */
function b64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s))
}

/** URL-safe base64 without padding (JWT segments / Gmail `raw`). */
function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlString(s: string): string {
  return base64url(new TextEncoder().encode(s))
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const der = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i)
  return der.buffer
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Service-account JSON often carries literal "\n" in the key string.
  const normalized = pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(normalized),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}
