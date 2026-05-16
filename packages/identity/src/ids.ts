// ULID helpers — Crockford Base32 26-char IDs with prefixes.
// 실제 ULID 라이브러리는 service 구현 시 추가 (ulidx 등). 이 파일은
// prefix 컨벤션을 한 곳에 모아둔다.

export const ID_PREFIX = {
  agent: 'ag_',
  human: 'hu_',
  tenant: 'tn_',
  key: 'kid_',
  enrollment: 'enr_',
  enrollmentToken: 'eret_',
  auditLog: 'alg_',
} as const

export type IdPrefix = keyof typeof ID_PREFIX

/**
 * ULID 형식인지 확인 (prefix 매칭 안 함).
 * Crockford Base32 — 0/I/L/O/U 제외, 26자.
 */
export const isUlid = (s: string): boolean =>
  /^[0-9A-HJKMNP-TV-Z]{26}$/.test(s)

/**
 * Prefix 매칭 확인. 예: `hasPrefix('ag_01H...', 'agent')`.
 */
export const hasPrefix = (id: string, kind: IdPrefix): boolean =>
  id.startsWith(ID_PREFIX[kind])

/**
 * Agent DID 빌더. 호출자가 issuer host 를 주입.
 * `did:web:{issuer}:agent:{id}`
 */
export const agentDid = (issuer: string, agentId: string): string =>
  `did:web:${issuer}:agent:${agentId}`

/**
 * Issuer DID 빌더. `did:web:{issuer}`
 */
export const issuerDid = (issuer: string): string => `did:web:${issuer}`
