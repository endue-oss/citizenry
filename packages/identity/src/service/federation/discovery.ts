// `/.well-known/citizenry-peer` 와 JWKS 를 fetch + parse.
//
// 외부 HTTP fetch 는 주입된 `fetcher` 를 통해 — 테스트에서 fake 로 교체 가능.

import { FED } from './errors'
import type { PeerDiscoveryDocument } from './types'

export type Fetcher = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>

const TIMEOUT_MS = 10_000

/**
 * issuer URL 정규화.
 *   - scheme: https 강제 (localhost 예외 — dev/test)
 *   - trailing slash 제거
 *   - path 없어야 함 (있으면 invalid)
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

/** issuer 의 `/.well-known/citizenry-peer` 를 가져와 형식 검증. */
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

/** issuer 의 JWKS 를 가져와 obj 그대로 반환 (서명 검증 시 sub-step 에서 파싱). */
export const fetchPeerJwks = async (
  fetcher: Fetcher,
  jwksUrl: string,
): Promise<Record<string, unknown>> =>
  fetchJsonWithTimeout<Record<string, unknown>>(fetcher, jwksUrl, FED.jwksFetchFailed)
