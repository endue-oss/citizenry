import type { ErrorHandler } from 'hono'

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(err)
  return c.json({ code: 'internal_error', message: err.message }, 500)
}
