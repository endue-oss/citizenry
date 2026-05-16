import type { MiddlewareHandler } from 'hono'
import type { Bindings } from '../env'

/**
 * Service PSK 검증 미들웨어 — 모든 admin 요청에 `X-Service-Key` 헤더 필수.
 * constant-time 비교.
 */
export const adminAuth: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  // /_health 만 예외 (헬스체크).
  if (c.req.path === '/_health') return next()

  const provided = c.req.header('X-Service-Key')
  const expected = c.env.SERVICE_KEY

  if (!provided || !expected || !timingSafeEqual(provided, expected)) {
    return c.json(
      {
        title: 'Unauthorized',
        message: 'X-Service-Key invalid',
        code: 'ERR-P01-S01-1020',
        method: c.req.method,
        instance: c.req.path,
        request_url: c.req.url,
        timestamp: new Date().toISOString(),
      },
      401,
    )
  }

  await next()
}

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
