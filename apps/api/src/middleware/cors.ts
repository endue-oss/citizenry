import { cors as honoCors } from 'hono/cors'

export const cors = honoCors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
})
