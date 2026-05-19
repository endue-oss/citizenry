// CORS for the admin-api gateway.
//
// admin-web (SvelteKit, dev port 3001) hits admin-api directly from the
// browser, so we need to advertise allowed origins and answer the
// preflight OPTIONS that the browser sends ahead of every JSON POST.
//
// Production origins (custom domains / pages.dev) are added here as
// adopters deploy. Wildcards are intentionally avoided so cookies and
// `Authorization` headers stay scoped.

import { cors as honoCors } from 'hono/cors'

export const cors = honoCors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Service-Key'],
  credentials: true,
})
