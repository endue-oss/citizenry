// Enrollment service — mint and revoke single/multi-use bootstrap
// tokens. Each enrollment is owned by a verified human (the caller's
// API-Key resolves to that owner). The raw `eret_<…>` token is
// surfaced exactly once at create; the row keeps only a peppered
// SHA-256, mirroring `human_api_key`.

import { eq } from 'drizzle-orm'
import type { Db } from '../db'
import { enrollmentToken, type EnrollmentTokenRow } from '../db/schema'
import { createEnrollmentTokenRepo } from '../repo/enrollment_token'

export type EnrollmentErrorCode =
  | 'enrollment_not_found'
  | 'enrollment_owner_mismatch'

export class EnrollmentError extends Error {
  readonly code: EnrollmentErrorCode
  readonly detail?: Record<string, unknown>
  constructor(code: EnrollmentErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'EnrollmentError'
    this.code = code
    this.detail = detail
  }
}

export type EnrollmentServiceDeps = {
  db: Db
  /** Peppered SHA-256 input. Same pepper as `human_api_key` / verification codes. */
  pepper: Uint8Array
  /** Mint a row id (`enr_<ULID>`). */
  mintEnrollmentId: () => string
  /** Mint a raw token (`eret_<…>`); only the hash is persisted. */
  mintToken: () => string
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
}

export type IssuedEnrollment = {
  id: string
  /** Raw `eret_<…>` token — surfaced once. */
  token: string
  ownerHumanPrincipalId: string
  tenantId: string
  usesTotal: number
  usesLeft: number
  allowKeygen: boolean
  expiresAt: Date
  createdAt: Date
  metadata: Record<string, unknown> | null
}

export type EnrollmentService = ReturnType<typeof createEnrollmentService>

async function hashToken(raw: string, pepper: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(raw)
  const buf = new Uint8Array(pepper.length + enc.length)
  buf.set(pepper, 0)
  buf.set(enc, pepper.length)
  const out = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(out)
}

export const createEnrollmentService = (deps: EnrollmentServiceDeps) => {
  const tokens = createEnrollmentTokenRepo(deps.db)
  const now = deps.now ?? Date.now

  return {
    /**
     * Mint a fresh enrollment for the given owner. Owner is sourced
     * from the calling API-Key (router resolves it before calling).
     */
    async create(input: {
      ownerHumanPrincipalId: string
      tenantId: string
      usesTotal: number
      ttlSecs: number
      allowKeygen?: boolean
      metadata?: Record<string, unknown>
    }): Promise<IssuedEnrollment> {
      const tNow = new Date(now())
      const token = deps.mintToken()
      const tokenHash = await hashToken(token, deps.pepper)
      const id = deps.mintEnrollmentId()
      const expiresAt = new Date(tNow.getTime() + input.ttlSecs * 1000)

      const [row] = await tokens.create({
        enrollmentTokenId: id,
        tokenHash,
        ownerHumanPrincipalId: input.ownerHumanPrincipalId,
        tenantId: input.tenantId,
        usesTotal: input.usesTotal,
        usesLeft: input.usesTotal,
        allowKeygen: input.allowKeygen ?? false,
        expiresAt,
        createdAt: tNow,
        createdBy: input.ownerHumanPrincipalId,
      })
      if (!row) throw new Error('enrollment_token insert returned no row')

      return {
        id: row.enrollmentTokenId,
        token,
        ownerHumanPrincipalId: row.ownerHumanPrincipalId,
        tenantId: row.tenantId,
        usesTotal: row.usesTotal,
        usesLeft: row.usesLeft,
        allowKeygen: row.allowKeygen,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        metadata: input.metadata ?? null,
      }
    },

    /**
     * Revoke. The caller's owner must match the enrollment's owner;
     * otherwise EnrollmentError('enrollment_owner_mismatch'). Idempotent.
     */
    async revoke(id: string, ownerHumanPrincipalId: string): Promise<EnrollmentTokenRow> {
      const found = await tokens.findById(id)
      const row = found[0]
      if (!row) throw new EnrollmentError('enrollment_not_found', 'no such enrollment')
      if (row.ownerHumanPrincipalId !== ownerHumanPrincipalId) {
        throw new EnrollmentError(
          'enrollment_owner_mismatch',
          'api-key owner does not match enrollment owner',
        )
      }
      if (row.revokedAt) return row
      const updated = await tokens.revoke(id, new Date(now()))
      return updated[0] ?? row
    },

    list: tokens.list,

    findById: async (id: string): Promise<EnrollmentTokenRow | undefined> => {
      const rows = await deps.db
        .select()
        .from(enrollmentToken)
        .where(eq(enrollmentToken.enrollmentTokenId, id))
        .limit(1)
      return rows[0]
    },
  }
}
