// "What's new" — checks the public GitHub releases of endue-oss/citizenry
// for a stable version newer than this build (APP_VERSION) so the admin
// rail can surface an update nudge that links to the release notes.
//
// Only *stable* releases count: drafts, GitHub prereleases, and any tag
// carrying a pre-release suffix (e.g. `v1.2.0-rc.1`) are ignored. The
// check is a public, unauthenticated GitHub API call — it works once the
// repository is public, and quietly yields nothing while it is private
// or has no stable release yet. Results are cached in localStorage to
// stay well under the 60 req/hour unauthenticated rate limit.

import { APP_VERSION } from './version'

const REPO = 'endue-oss/citizenry'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`
const CACHE_KEY = 'citizenry.whatsnew.v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h

export type UpdateInfo = { version: string; url: string }

type GhRelease = {
  tag_name: string
  html_url: string
  draft: boolean
  prerelease: boolean
}

// Parse a clean stable semver tag into comparable parts. Returns null for
// anything that isn't a pure `X.Y.Z` (optionally `v`-prefixed) — which is
// exactly how `-rc`/`-beta` and other pre-release tags get excluded.
export function parseStable(tag: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

// Is `a` a strictly higher version than `b`?
export function isNewer(
  a: [number, number, number],
  b: [number, number, number],
): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

function readCache(): UpdateInfo | null | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return undefined
    const { at, version, data } = JSON.parse(raw) as {
      at: number
      version: string
      data: UpdateInfo | null
    }
    // Invalidate when stale, or when this build's version changed (a
    // fresh deploy should re-evaluate against its own version).
    if (Date.now() - at > CACHE_TTL_MS || version !== APP_VERSION) return undefined
    return data
  } catch {
    return undefined
  }
}

function writeCache(data: UpdateInfo | null) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), version: APP_VERSION, data }),
    )
  } catch {
    // localStorage unavailable (private mode / disabled) — skip caching.
  }
}

// Resolve the newest stable release strictly greater than APP_VERSION, or
// null when there's nothing newer (or the check can't run). `fetchImpl`
// is injectable for tests.
export async function checkForUpdate(
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateInfo | null> {
  const cached = readCache()
  if (cached !== undefined) return cached

  const current = parseStable(APP_VERSION)
  // Without a parseable current version we can't compare safely — never
  // nag in that case.
  if (!current) {
    writeCache(null)
    return null
  }

  let best: { parts: [number, number, number]; info: UpdateInfo } | null = null
  try {
    const res = await fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      writeCache(null)
      return null
    }
    const releases = (await res.json()) as GhRelease[]
    for (const r of releases) {
      if (r.draft || r.prerelease) continue
      const parts = parseStable(r.tag_name)
      if (!parts) continue // drops `-rc` and other non-clean tags
      if (!best || isNewer(parts, best.parts)) {
        best = { parts, info: { version: r.tag_name, url: r.html_url } }
      }
    }
  } catch {
    // Network / CORS / offline — fail closed (show nothing).
    writeCache(null)
    return null
  }

  const result = best && isNewer(best.parts, current) ? best.info : null
  writeCache(result)
  return result
}
