import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

// MCP gateway. Tools/resources will wire through @citizenry/identity and
// @citizenry/vault domain services. Transport (HTTP/SSE) wired here.

const app = new Hono()

app.use('*', secureHeaders({ crossOriginResourcePolicy: false, xFrameOptions: 'DENY' }))

app.get('/', (c) => c.json({ service: 'citizenry-mcp', status: 'ok' }))

// TODO: mount MCP transport handler and register tools.

export default app
