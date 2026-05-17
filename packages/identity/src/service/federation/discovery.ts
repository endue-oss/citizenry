// Fetch + parse `/.well-known/citizenry-peer` and JWKS.
//
// External HTTP fetch goes through the injected `fetcher` — replaceable with a fake in tests.

import { FED } from './errors'
import type { PeerDiscoveryDocument } from './types'

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

const TIMEOUT_MS = 10_000

/**
 * Normalize an issuer URL.
 *   - scheme: https enforced (localhost excepted — dev/test)
 *   - trailing slash stripped
 *   - must have no path (invalid if present)
 */
export const normalizeIssuer = (raw: string): string => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw FED.invalidIssuerUrl(`could not parse: ${raw}`)
  }
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'
  if (url.protocol !== 'https:' && !isLoopback) {
    throw FED.invalidIssuerUrl(`must use https: ${raw}`)
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw FED.invalidIssuerUrl(`must not contain a path: ${raw}`)
  }
  if (url.search || url.hash) {
    throw FED.invalidIssuerUrl(`must not contain query/hash: ${raw}`)
  }
  return `${url.protocol}//${url.host}`
}

const fetchJsonWithTimeout = async <T,>(
  fetcher: Fetcher,
  url: string,
  errFactory: (msg: string, detail?: Record<string, unknown>) => Error,
): Promise<T> => {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      throw errFactory(`HTTP ${res.status} from ${url}`, { status: res.status })
    }
    const body = await res.text()
    try {
      return JSON.parse(body) as T
    } catch {
      throw errFactory(`response from ${url} was not valid JSON`)
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch the issuer's `/.well-known/citizenry-peer` and validate its shape. */
export const fetchPeerDiscovery = async (
  fetcher: Fetcher,
  issuer: string,
): Promise<PeerDiscoveryDocument> => {
  const url = `${issuer}/.well-known/citizenry-peer`
  const doc = await fetchJsonWithTimeout<PeerDiscoveryDocument>(fetcher, url, FED.discoveryFailed)

  if (typeof doc?.protocol_version !== 'number') {
    throw FED.discoveryFailed('missing protocol_version', { url })
  }
  if (typeof doc.issuer !== 'string' || normalizeIssuer(doc.issuer) !== issuer) {
    throw FED.discoveryFailed('issuer field does not match URL host', {
      expected: issuer,
      reported: doc.issuer,
    })
  }
  if (!/^ci_[0-9A-HJKMNP-TV-Z]{26}$/.test(doc.instance_id)) {
    throw FED.discoveryFailed('invalid instance_id format', { instance_id: doc.instance_id })
  }
  return doc
}

/** Fetch the issuer's JWKS and return the object as-is (parsed during a signature-verify sub-step). */
export const fetchPeerJwks = async (
  fetcher: Fetcher,
  jwksUrl: string,
): Promise<Record<string, unknown>> =>
  fetchJsonWithTimeout<Record<string, unknown>>(fetcher, jwksUrl, FED.jwksFetchFailed)
