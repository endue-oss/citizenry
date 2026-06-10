// Rate limiter for the unauth POSTs on the humans surface (RFC-0004).
//
//   /v1/humans         — fresh-email registration
//   /v1/humans/rotate  — code resend for an existing row
//   /v1/humans/verify  — code submission
//
// Per choice 12A: 2 requests/min, 15 requests/day, scoped per
// (email | ip, endpoint). Backed by the rate_limit_event D1 table —
// no external Redis. Each call to `check` runs three statements:
//   SELECT count(*) WHERE ts > now-60s     -- per-minute window
//   SELECT count(*) WHERE ts > now-86400s  -- per-day window
//   INSERT row (or DELETE old + INSERT)
//
// Cleanup: on every recordHit, opportunistically delete rows older
// than the day window. No background job.

import { and, eq, gt, lt, sql } from 'drizzle-orm'
import type { Db } from '../db'
import { rateLimitEvent } from '../db/schema'

export type RateLimitScope =
  | 'humans.start'
  | 'humans.rotate'
  | 'humans.verify'
  | 'admin.login'
export type RateLimitBucket = {
  kind: 'email' | 'ip'
  value: string
}

const MIN_WINDOW_MS = 60 * 1000
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000

export const PER_MINUTE_CAP = 2
export const PER_DAY_CAP = 15

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSecs: number; reason: 'minute' | 'day' }

export type RateLimitService = ReturnType<typeof createRateLimitService>

export type RateLimitServiceDeps = {
  db: Db
  /** Inject for tests; defaults to Date.now. */
  now?: () => number
}

export function createRateLimitService(deps: RateLimitServiceDeps) {
  const now = deps.now ?? Date.now

  async function countSince(
    bucket: RateLimitBucket,
    scope: RateLimitScope,
    sinceMs: number,
  ): Promise<number> {
    const rows = await deps.db
      .select({ n: sql<number>`count(*)`.as('n') })
      .from(rateLimitEvent)
      .where(
        and(
          eq(rateLimitEvent.bucketKind, bucket.kind),
          eq(rateLimitEvent.bucketValue, bucket.value),
          eq(rateLimitEvent.scope, scope),
          gt(rateLimitEvent.ts, new Date(sinceMs)),
        ),
      )
    return Number(rows[0]?.n ?? 0)
  }

  return {
    /**
     * Check whether `bucket` is allowed to perform `scope` once more
     * right now. Does NOT record the hit — the caller records on
     * success via `recordHit`. (Read-only check first lets the route
     * issue a clean 429 with `Retry-After` without polluting the
     * counter.)
     *
     * Buckets pass independently: if email is under cap but IP is
     * over, the IP cap wins. The route checks both.
     */
    async check(
      bucket: RateLimitBucket,
      scope: RateLimitScope,
      caps?: { perMinute?: number; perDay?: number },
    ): Promise<RateLimitDecision> {
      const perMinute = caps?.perMinute ?? PER_MINUTE_CAP
      const perDay = caps?.perDay ?? PER_DAY_CAP
      const tNow = now()
      const minuteCount = await countSince(bucket, scope, tNow - MIN_WINDOW_MS)
      if (minuteCount >= perMinute) {
        return { allowed: false, retryAfterSecs: 60, reason: 'minute' }
      }
      const dayCount = await countSince(bucket, scope, tNow - DAY_WINDOW_MS)
      if (dayCount >= perDay) {
        // Best-effort: tell the caller they have to wait at most
        // until the oldest day-window row falls out (= roughly the
        // remainder of 24h).
        return { allowed: false, retryAfterSecs: 24 * 60 * 60, reason: 'day' }
      }
      return { allowed: true }
    },

    /**
     * Record an attempt + opportunistically prune stale rows. Call
     * after the route has accepted the request body (and before any
     * side effects) so failed validation doesn't also burn the
     * budget — except for `humans.verify`, where every code attempt
     * MUST count to defend against brute force.
     */
    async recordHit(bucket: RateLimitBucket, scope: RateLimitScope): Promise<void> {
      const tNow = new Date(now())
      await deps.db.insert(rateLimitEvent).values({
        bucketKind: bucket.kind,
        bucketValue: bucket.value,
        scope,
        ts: tNow,
      })
      // Drop rows older than the longest window. Cheap when the
      // table is small; an index on `ts` keeps it from going O(n).
      await deps.db
        .delete(rateLimitEvent)
        .where(lt(rateLimitEvent.ts, new Date(now() - DAY_WINDOW_MS)))
    },
  }
}
