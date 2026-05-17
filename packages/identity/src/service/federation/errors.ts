// Federation 도메인 전용 에러 — service 가 던지고 router 가 envelope.
//
// RFC-0001 §"New error codes" 의 코드와 1:1 대응. envelope 변환은
// router 단의 onError 가 BaseError → HTTP response 로 맞춰 처리.

export class FederationError extends Error {
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
    this.name = 'FederationError'
    this.code = args.code
    this.status = args.status
    this.title = args.title
    this.detail = args.detail
  }
}

const make =
  (code: string, status: number, title: string) =>
  (message: string, detail?: Record<string, unknown>) =>
    new FederationError({ code, status, title, message, detail })

export const FED = {
  jwsVerifyFailed: make('ERR-P01-FED-1001', 401, 'Federation JWS verify failed'),
  issuerMismatch: make('ERR-P01-FED-1002', 401, 'Federation issuer mismatch'),
  replay: make('ERR-P01-FED-1003', 401, 'Federation nonce replay'),
  invalidIssuerUrl: make('ERR-P01-FED-2001', 422, 'Invalid issuer URL'),
  peerNotFound: make('ERR-P01-FED-3001', 404, 'Federation peer not found'),
  peerAlreadyExists: make('ERR-P01-FED-3002', 409, 'Federation peer already exists'),
  invalidTransition: make('ERR-P01-FED-3003', 409, 'Federation peer state transition not allowed'),
  discoveryFailed: make('ERR-P01-FED-4001', 502, 'Peer discovery failed'),
  jwksFetchFailed: make('ERR-P01-FED-4002', 502, 'Peer JWKS fetch failed'),
  remoteError: make('ERR-P01-FED-4003', 502, 'Peer handshake returned error'),
  nonceMismatch: make('ERR-P01-FED-5001', 500, 'Federation nonce mismatch'),
} as const
