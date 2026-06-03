// Mail-domain errors — thrown by the router, enveloped by the BaseError
// helper. Codes come from `@citizenry/spec/error-codes/mail`, which is
// generated from packages/spec/mail/errors.tsp (the source of truth).

import { MAIL_ERR } from '@citizenry/spec/error-codes/mail'

export class MailError extends Error {
  readonly code: string
  readonly status: number
  readonly title: string
  readonly detail?: Record<string, unknown>

  constructor(args: {
    code: string
    status: number
    title: string
    message: string
    detail?: Record<string, unknown>
  }) {
    super(args.message)
    this.name = 'MailError'
    this.code = args.code
    this.status = args.status
    this.title = args.title
    this.detail = args.detail
  }
}

const make =
  (code: string, status: number, title: string) =>
  (message: string, detail?: Record<string, unknown>) =>
    new MailError({ code, status, title, message, detail })

export const MAIL = {
  badRequest: make(MAIL_ERR.bad_request, 400, 'Bad Request'),
  notFound: make(MAIL_ERR.not_found, 404, 'Not Found'),
  rateLimited: make(MAIL_ERR.rate_limited, 429, 'Too Many Requests'),
  internal: make(MAIL_ERR.internal, 500, 'Internal Server Error'),
  unavailable: make(MAIL_ERR.unavailable, 503, 'Service Unavailable'),
  invalidBody: make(MAIL_ERR.invalid_body, 400, 'Bad Request'),
  fromRequired: make(MAIL_ERR.from_required, 400, 'Bad Request'),
  sendFailed: make(MAIL_ERR.send_failed, 502, 'Bad Gateway'),
} as const
