import { describe, expect, it, vi } from 'vitest'
import type { ConfigEntry, ConfigReader } from './service/reader'
import { withTtlCache } from './cache'

// ── helpers ────────────────────────────────────────────────
// A controllable clock and a spy-able fake reader keep these tests
// deterministic without setTimeout or real D1.

function mockEntry<T>(key: string, value: T): ConfigEntry<T> {
  return {
    id: `cfg_${key}`,
    key,
    value,
    updatedAt: new Date(0),
    updatedBy: null,
  }
}

function fakeReader(store: Record<string, ConfigEntry | null>): ConfigReader & {
  getCalls: string[]
} {
  const getCalls: string[] = []
  return {
    getCalls,
    async get<T>(key: string): Promise<ConfigEntry<T> | null> {
      getCalls.push(key)
      return (store[key] ?? null) as ConfigEntry<T> | null
    },
    async list() {
      return []
    },
  }
}

function clock(initial = 1_000) {
  let t = initial
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe('withTtlCache', () => {
  it('reads upstream on miss, hits cache on subsequent reads within TTL', async () => {
    const upstream = fakeReader({ 'a.b': mockEntry('a.b', 1) })
    const c = clock()
    const cached = withTtlCache(upstream, { ttlMs: 1_000, now: c.now })

    const first = await cached.get<number>('a.b')
    const second = await cached.get<number>('a.b')

    expect(first?.value).toBe(1)
    expect(second?.value).toBe(1)
    expect(upstream.getCalls).toEqual(['a.b'])
    expect(cached.size()).toBe(1)
  })

  it('reloads after TTL expires', async () => {
    const upstream = fakeReader({ 'a.b': mockEntry('a.b', 1) })
    const c = clock()
    const cached = withTtlCache(upstream, { ttlMs: 1_000, now: c.now })

    await cached.get('a.b')
    c.advance(1_001)
    await cached.get('a.b')

    expect(upstream.getCalls).toEqual(['a.b', 'a.b'])
  })

  it('negative-caches null results too', async () => {
    const upstream = fakeReader({})
    const c = clock()
    const cached = withTtlCache(upstream, { ttlMs: 1_000, now: c.now })

    const a = await cached.get('missing')
    const b = await cached.get('missing')

    expect(a).toBeNull()
    expect(b).toBeNull()
    expect(upstream.getCalls).toEqual(['missing'])
  })

  it('dedupes concurrent in-flight misses for the same key', async () => {
    // The upstream pauses on its first call until release() resolves.
    // Without dedupe, two parallel get(key) calls would each trigger
    // an upstream get; with dedupe they share one Promise.
    let release!: (e: ConfigEntry) => void
    const pending = new Promise<ConfigEntry>((res) => {
      release = res
    })
    const upstream: ConfigReader & { getCalls: string[] } = {
      getCalls: [] as string[],
      async get(key: string) {
        this.getCalls.push(key)
        return (await pending) as never
      },
      async list() {
        return []
      },
    }
    const cached = withTtlCache(upstream, { ttlMs: 1_000 })

    const a = cached.get<number>('shared')
    const b = cached.get<number>('shared')
    release(mockEntry('shared', 42))

    const [ra, rb] = await Promise.all([a, b])
    expect(ra?.value).toBe(42)
    expect(rb?.value).toBe(42)
    expect(upstream.getCalls).toEqual(['shared'])
  })

  it('invalidate(key) forces the next get to refetch', async () => {
    const upstream = fakeReader({ 'a.b': mockEntry('a.b', 1) })
    const c = clock()
    const cached = withTtlCache(upstream, { ttlMs: 60_000, now: c.now })

    await cached.get('a.b')
    cached.invalidate('a.b')
    await cached.get('a.b')

    expect(upstream.getCalls).toEqual(['a.b', 'a.b'])
  })

  it('clear() drops every cached slot', async () => {
    const upstream = fakeReader({
      'a.b': mockEntry('a.b', 1),
      'a.c': mockEntry('a.c', 2),
    })
    const cached = withTtlCache(upstream, { ttlMs: 60_000 })

    await cached.get('a.b')
    await cached.get('a.c')
    expect(cached.size()).toBe(2)

    cached.clear()
    expect(cached.size()).toBe(0)

    await cached.get('a.b')
    expect(upstream.getCalls).toEqual(['a.b', 'a.c', 'a.b'])
  })

  it('defaults to a 5-minute TTL when none is supplied', async () => {
    const upstream = fakeReader({ 'a.b': mockEntry('a.b', 1) })
    const c = clock()
    const cached = withTtlCache(upstream, { now: c.now })

    await cached.get('a.b')
    c.advance(4 * 60 * 1000) // 4 minutes — still fresh
    await cached.get('a.b')
    expect(upstream.getCalls).toEqual(['a.b'])

    c.advance(2 * 60 * 1000) // crosses the 5-minute boundary
    await cached.get('a.b')
    expect(upstream.getCalls).toEqual(['a.b', 'a.b'])
  })

  it('list is passed through verbatim', async () => {
    const list = vi.fn(async () => [mockEntry('a.x', 1), mockEntry('a.y', 2)])
    const upstream: ConfigReader = {
      get: async () => null,
      list: list as unknown as ConfigReader['list'],
    }
    const cached = withTtlCache(upstream, { ttlMs: 1_000 })

    const out = await cached.list('a.')
    expect(out).toHaveLength(2)
    expect(list).toHaveBeenCalledWith('a.')
  })
})
