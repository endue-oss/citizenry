// Colo-local TTL cache for ConfigReader.
//
// Why this exists: every Worker request that needs a config value
// would otherwise hit D1. D1 reads are cheap but not free — the cost
// adds up on hot paths (auth middleware, mail send), and we want
// changes made through admin-api to propagate without operator
// intervention. A short TTL gives us both: bounded staleness in
// exchange for skipping the round trip.
//
// Lifetime: the cache is a module-scope `Map` inside the closure
// returned by `withTtlCache`, so it lives as long as the V8 isolate
// that imported it. Each isolate keeps its own copy — that is the
// "colo-local" property; consistency across isolates / colos is
// eventually achieved as TTLs expire.
//
// Negative caching: `reader.get(...)` returning `null` is cached too,
// so a missing key does not hammer D1 on a hot path. The same TTL
// applies.
//
// In-flight dedupe: a second `get(key)` arriving while the first is
// still loading reuses the same Promise. Prevents the "thundering
// herd" pattern on cache miss.

import type { ConfigEntry, ConfigReader } from './service/reader'

export type TtlCacheOptions = {
  /** TTL for cached entries. Defaults to 5 minutes. */
  ttlMs?: number
  /**
   * Time source — defaults to `Date.now`. Injected for tests so they
   * can advance time without `setTimeout`.
   */
  now?: () => number
}

type Slot = {
  /** Cached payload, including the `null` "missing" sentinel. */
  value: ConfigEntry | null
  /** epoch ms at which this slot becomes stale. */
  expiresAt: number
}

export type CachedConfigReader = ConfigReader & {
  /** Drop a single cached key. The next `get` will reload from upstream. */
  invalidate(key: string): void
  /** Drop everything. */
  clear(): void
  /** Number of slots currently held — for tests / diagnostics. */
  size(): number
}

const DEFAULT_TTL_MS = 5 * 60 * 1000

export const withTtlCache = (
  upstream: ConfigReader,
  opts: TtlCacheOptions = {},
): CachedConfigReader => {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
  const now = opts.now ?? Date.now
  const slots = new Map<string, Slot>()
  const inflight = new Map<string, Promise<ConfigEntry | null>>()

  async function load(key: string): Promise<ConfigEntry | null> {
    const existing = inflight.get(key)
    if (existing) return existing
    const p = (async () => {
      try {
        const fresh = await upstream.get(key)
        slots.set(key, { value: fresh, expiresAt: now() + ttlMs })
        return fresh
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, p)
    return p
  }

  return {
    async get<T = unknown>(key: string): Promise<ConfigEntry<T> | null> {
      const slot = slots.get(key)
      if (slot && slot.expiresAt > now()) {
        return slot.value as ConfigEntry<T> | null
      }
      const value = await load(key)
      return value as ConfigEntry<T> | null
    },

    /**
     * `list` is intentionally a passthrough — it would be too easy
     * for a cached list to drift from individual cached gets, and
     * `list` is an admin-shaped read in practice. Data-plane code
     * should use `get(key)` for hot paths.
     */
    list: upstream.list.bind(upstream),

    invalidate(key: string): void {
      slots.delete(key)
    },

    clear(): void {
      slots.clear()
    },

    size(): number {
      return slots.size
    },
  }
}
