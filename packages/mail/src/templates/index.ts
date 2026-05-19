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
// the code at POST /api/v1/humans/:id/verify within 30 minutes.

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

// ── registry ───────────────────────────────────────────────
// Discriminated by `template` so each renderer keeps its own typed
// context. Adding a template means adding a key and a renderer here.

export type TemplatePayload = {
  template: 'human_verification'
  context: HumanVerificationContext
}

export function renderTemplate(payload: TemplatePayload): RenderedTemplate {
  switch (payload.template) {
    case 'human_verification':
      return renderHumanVerification(payload.context)
    default: {
      const _exhaustive: never = payload.template
      void _exhaustive
      throw new Error(`unknown template: ${(payload as { template: string }).template}`)
    }
  }
}

export const KNOWN_TEMPLATES = ['human_verification'] as const
export type TemplateKey = (typeof KNOWN_TEMPLATES)[number]

export function isKnownTemplate(value: string): value is TemplateKey {
  return (KNOWN_TEMPLATES as readonly string[]).includes(value)
}
