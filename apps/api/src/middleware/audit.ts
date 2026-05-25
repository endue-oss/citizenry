// Admin audit middleware.
//
// Records one row in the identity `audit_log` for every *mutating*
// /_admin request (POST/PUT/PATCH/DELETE) — config / identity / vault
// alike — so the operator console can show who changed what, when.
// Reads (GET/HEAD) are intentionally not audited.
//
// Runs after serviceKeyAuth, so only authenticated admin traffic is
// recorded. The write is fire-and-forget via waitUntil and never blocks
// or fails the request.
//
// SECURITY: we deliberately never read the request body. The payload we
// store is limited to method/path/status, so secret config values
// (admin.password, provider keys, …) can never leak into the audit log.
// The config *key* lives in the path and is recorded as the target —
// key names are not secret.

import type { MiddlewareHandler } from 'hono'
import { drizzle } from 'drizzle-orm/d1'
import { schema as identitySchema } from '@citizenry/identity/schema'
import type { Bindings } from '../env'
import { newAuditLogId } from '../ids'

/** Map a mutating admin request to a stable action label + target id. */
function classify(
  method: string,
  pathname: string,
): { action: string; target: string | null } {
  // Normalize to the part after `/v1/admin/` regardless of mount prefix.
  const i = pathname.indexOf('/v1/admin/')
  const p = i >= 0 ? pathname.slice(i + '/v1/admin/'.length) : pathname
  let m: RegExpMatchArray | null

  if (p.startsWith('config/')) {
    return {
      action: method === 'DELETE' ? 'config.delete' : 'config.set',
      target: p.slice('config/'.length) || null,
    }
  }
  if ((m = p.match(/^agents\/([^/]+)$/)) && method === 'DELETE') {
    return { action: 'agent.revoke', target: m[1] ?? null }
  }
  if (p === 'federation/peers' && method === 'POST') {
    return { action: 'federation.peer.add', target: null }
  }
  if ((m = p.match(/^federation\/peers\/([^/]+)\/transition$/)) && method === 'POST') {
    return { action: 'federation.peer.transition', target: m[1] ?? null }
  }
  if ((m = p.match(/^federation\/peers\/([^/]+)\/jwks-refresh$/)) && method === 'POST') {
    return { action: 'federation.peer.jwks_refresh', target: m[1] ?? null }
  }
  if ((m = p.match(/^federation\/peers\/([^/]+)$/)) && method === 'DELETE') {
    return { action: 'federation.peer.revoke', target: m[1] ?? null }
  }
  if ((m = p.match(/^vault\/entries\/([^/]+)$/)) && method === 'DELETE') {
    return { action: 'vault.entry.delete', target: m[1] ?? null }
  }
  return { action: `${method.toLowerCase()} /v1/admin/${p}`, target: null }
}

export const auditAdmin: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  await next()

  const method = c.req.method
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return

  const pathname = new URL(c.req.url).pathname
  const { action, target } = classify(method, pathname)

  const write = (async () => {
    const db = drizzle(c.env.DB_IDENTITY, { schema: identitySchema })
    await db.insert(identitySchema.auditLog).values({
      auditLogId: newAuditLogId(),
      actorPrincipalId: c.req.header('X-Admin-Id') ?? null,
      action,
      targetId: target,
      outcome: c.res.status < 400 ? 'success' : 'failure',
      payload: { method, path: pathname, status: c.res.status },
      createdAt: new Date(),
    })
  })().catch(() => {
    // Audit is best-effort; never surface its failure to the caller.
  })

  c.executionCtx?.waitUntil?.(write)
}
