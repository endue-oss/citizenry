import { Hono } from 'hono'

// MCP gateway. Tools/resources will wire through @citizenry/identity and
// @citizenry/vault domain services. Transport (HTTP/SSE) wired here.

const app = new Hono()

app.get('/', (c) => c.json({ service: 'citizenry-mcp', status: 'ok' }))

// TODO: mount MCP transport handler and register tools.

export default app
