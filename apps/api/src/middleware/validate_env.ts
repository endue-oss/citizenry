// Boot-time env validation. A missing or malformed secret otherwise
// surfaces as a confusing failure deep inside a request (e.g. an
// "hex length must be even" throw from hexToBytes while verifying an
// API-Key). Validate once per isolate and fail every request loudly
// instead. `/_health` stays exempt so probes keep answering.
//
// Responses name the offending variable but never echo values.

import type { MiddlewareHandler } from 'hono'
import { IDENTITY_ERR } from '@citizenry/spec/error-codes/identity'
import type { Bindings } from '../env'

let problems: string[] | null = null

const isHex = (v: string): boolean =>
  v.length > 0 && v.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(v)

export const validateEnv: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (c.req.path === '/_health') return next()
  if (problems === null) {
    const found: string[] = []
    if (!c.env.ENROLLMENT_PEPPER || !isHex(c.env.ENROLLMENT_PEPPER)) {
      found.push('ENROLLMENT_PEPPER must be non-empty hex')
    }
    if (!c.env.SERVICE_KEY) found.push('SERVICE_KEY is empty')
    if (!c.env.ISSUER_HOST) found.push('ISSUER_HOST is empty')
    if (!c.env.JWT_AUDIENCE) found.push('JWT_AUDIENCE is empty')
    problems = found
  }
  if (problems.length > 0) {
    console.error(`api misconfigured: ${problems.join('; ')}`)
    return c.json(
      {
        title: 'Internal Server Error',
        code: IDENTITY_ERR.internal,
        message: `worker misconfigured: ${problems.join('; ')} — re-run the deploy workflow (it bootstraps these secrets) or see docs/deploy.md`,
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
  return next()
}
