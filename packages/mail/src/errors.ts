// Mail-domain errors — thrown by the router, enveloped by the BaseError
// helper. 1:1 with the codes in packages/spec/mail/errors.tsp.

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
  badRequest: make('ERR-P01-S02-0400', 400, 'Bad Request'),
  notFound: make('ERR-P01-S02-0404', 404, 'Not Found'),
  rateLimited: make('ERR-P01-S02-0429', 429, 'Too Many Requests'),
  internal: make('ERR-P01-S02-0500', 500, 'Internal Server Error'),
  unavailable: make('ERR-P01-S02-0503', 503, 'Service Unavailable'),
  invalidBody: make('ERR-P01-S02-2001', 400, 'Bad Request'),
  fromRequired: make('ERR-P01-S02-2002', 400, 'Bad Request'),
  sendFailed: make('ERR-P01-S02-4001', 502, 'Bad Gateway'),
} as const
