// Boot-time env validation. A missing or malformed secret otherwise
// surfaces as a confusing failure deep inside a request (e.g. an
// "hex length must be even" throw while hashing a refresh token).
// Validate once per isolate and fail every request loudly instead.
//
// Responses name the offending variable but never echo values.

import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../env'

let problems: string[] | null = null

const isHex = (v: string): boolean =>
  v.length > 0 && v.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(v)

export const validateEnv: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  if (problems === null) {
    const found: string[] = []
    if (!c.env.SERVICE_KEY) found.push('SERVICE_KEY is empty')
    if (!c.env.ADMIN_ID) found.push('ADMIN_ID is empty')
    if (!c.env.ADMIN_JWT_SECRET) found.push('ADMIN_JWT_SECRET is empty')
    if (!c.env.ADMIN_REFRESH_PEPPER || !isHex(c.env.ADMIN_REFRESH_PEPPER)) {
      found.push('ADMIN_REFRESH_PEPPER must be non-empty hex')
    }
    problems = found
  }
  if (problems.length > 0) {
    console.error(`admin-api misconfigured: ${problems.join('; ')}`)
    return c.json(
      {
        title: 'Internal Server Error',
        code: 'ERR-P01-ADM-0500',
        message: `worker misconfigured: ${problems.join('; ')} — re-run the deploy workflow (it bootstraps these secrets) or see docs/deploy.md`,
        timestamp: new Date().toISOString(),
      },
      500,
    )
  }
  return next()
}
