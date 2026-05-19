// Notification templates rendered by the mail Worker's
// `/_internal/notify` route. Callers identify a template by key and
// supply a typed `context` object; the renderer returns subject + text
// + html. New templates are added here so all outbound copy stays in
// one place (i18n / wording / design changes touch one file).
//
// See ADR-2026-0005.

export type RenderedTemplate = {
  subject: string
  text: string
  html?: string
}

// ── human_verification ─────────────────────────────────────
// Sent by api when a human starts registration. The recipient enters
// the code at POST /v1/humans/:id/verify within 30 minutes.

export type HumanVerificationContext = {
  /** Verification code (6-digit numeric as a string). */
  code: string
  /** Minutes until the code expires from the moment it was minted. */
  expiresInMinutes: number
}

function renderHumanVerification(ctx: HumanVerificationContext): RenderedTemplate {
  const subject = `Your Citizenry verification code is ${ctx.code}`
  const text = [
    `Your Citizenry verification code is: ${ctx.code}`,
    '',
    `This code expires in ${ctx.expiresInMinutes} minutes.`,
    '',
    'If you did not start this registration, you can ignore this email.',
    '— Endue Citizenry',
  ].join('\n')
  const html =
    `<p>Your Citizenry verification code is:</p>` +
    `<p style="font-size:24px;font-family:monospace;letter-spacing:4px"><strong>${ctx.code}</strong></p>` +
    `<p>This code expires in ${ctx.expiresInMinutes} minutes.</p>` +
    `<p style="color:#888;font-size:12px">If you did not start this registration, you can ignore this email.</p>`
  return { subject, text, html }
}

// ── human_api_key ──────────────────────────────────────────
// Sent by api when a verified human issues an API-Key. The raw token
// is delivered out-of-band so a key issued from one device can be
// retrieved on another (e.g. issue from a terminal, paste on a phone).

export type HumanApiKeyContext = {
  /** Raw API-Key — `chk_<…>`. Surfaced once. */
  token: string
  /** Optional label the human attached at issue time. */
  displayName?: string | null
  /** Absolute expiry; omitted when the key never expires. */
  expiresAt?: string | null
}

function renderHumanApiKey(ctx: HumanApiKeyContext): RenderedTemplate {
  const label = ctx.displayName ? ` (${ctx.displayName})` : ''
  const subject = `Your new Citizenry API key${label}`
  const expiryLine = ctx.expiresAt
    ? `This key expires at ${ctx.expiresAt}.`
    : 'This key does not expire.'
  const text = [
    `Your new Citizenry API key${label} is:`,
    '',
    ctx.token,
    '',
    expiryLine,
    'Keep it secret — it cannot be retrieved again. If you did not request',
    'this key, revoke it immediately at /v1/humans/{id}/api-key/revoke.',
    '— Endue Citizenry',
  ].join('\n')
  const html =
    `<p>Your new Citizenry API key${label} is:</p>` +
    `<p style="font-family:monospace;background:#f6f8fa;padding:12px;border-radius:6px;word-break:break-all"><strong>${ctx.token}</strong></p>` +
    `<p>${expiryLine}</p>` +
    `<p style="color:#888;font-size:12px">Keep it secret — it cannot be retrieved again. If you did not request this key, revoke it immediately.</p>`
  return { subject, text, html }
}

// ── registry ───────────────────────────────────────────────
// Discriminated by `template` so each renderer keeps its own typed
// context. Adding a template means adding a key and a renderer here.

export type TemplatePayload =
  | { template: 'human_verification'; context: HumanVerificationContext }
  | { template: 'human_api_key'; context: HumanApiKeyContext }

export function renderTemplate(payload: TemplatePayload): RenderedTemplate {
  switch (payload.template) {
    case 'human_verification':
      return renderHumanVerification(payload.context)
    case 'human_api_key':
      return renderHumanApiKey(payload.context)
    default: {
      const _exhaustive: never = payload
      void _exhaustive
      throw new Error(
        `unknown template: ${(payload as { template: string }).template}`,
      )
    }
  }
}

export const KNOWN_TEMPLATES = ['human_verification', 'human_api_key'] as const
export type TemplateKey = (typeof KNOWN_TEMPLATES)[number]

export function isKnownTemplate(value: string): value is TemplateKey {
  return (KNOWN_TEMPLATES as readonly string[]).includes(value)
}
