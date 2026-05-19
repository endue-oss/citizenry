// Human self-registration with email verification.
//
// Flow (see ADR-2026-0005 + the /v1/humans spec):
//
//   1. POST /v1/humans { email }
//        → mint principal + human (status='pending_verification')
//        → mint verification row with code_hash + 30-min expiry
//        → return code to the caller (Notifier sends it via mail Worker)
//   2. recipient enters the 6-digit code
//   3. POST /v1/humans/:id/verify { code }
//        → constant-time hash compare against stored peppered SHA-256
//        → flip human.status='active', humanEmailVerification.verifiedAt
//   4. POST /v1/humans/:id/verify/resend
//        → bumps resend_count, recomputes next_resend_at with the
//          arithmetic backoff (1,2,3,...,60 min)
//
// All time math uses Date objects backed by Date.now(); injectable as
// `now` for tests.

import { and, eq } from 'drizzle-orm'
import type { ConfigReader } from '@citizenry/config'
import type { Db } from '../db'
import {
  humanEmailVerification,
  human,
  principal,
  type HumanRow,
  type HumanEmailVerificationRow,
} from '../db/schema'
import { createHumanEmailVerificationRepo } from '../repo/human_email_verification'

// ── notifier interface ─────────────────────────────────────────────
// Injected by the api Worker; the package itself is delivery-agnostic.
// See ADR-2026-0005 and apps/api/src/notifier.ts.

export type Notifier = {
  send(args: {
    template: 'human_verification'
    to: Array<{ name?: string; mail: string }>
    context: { code: string; expiresInMinutes: number }
  }): Promise<{ delivered: boolean; outbound_log_id: string; status: string }>
}

// ── domain errors ──────────────────────────────────────────────────

export type HumanErrorCode =
  | 'email_invalid'
  | 'email_domain_not_allowed'
  | 'email_already_active'
  | 'email_already_pending'
  | 'human_not_found'
  | 'human_already_verified'
  | 'verification_expired'
  | 'verification_code_invalid'
  | 'resend_too_soon'

export class HumanError extends Error {
  readonly code: HumanErrorCode
  readonly detail?: Record<string, unknown>
  constructor(code: HumanErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'HumanError'
    this.code = code
    this.detail = detail
  }
}

// ── constants ──────────────────────────────────────────────────────

const VERIFICATION_TTL_MS = 30 * 60 * 1000
const RESEND_STEP_MS = 60 * 1000
const RESEND_STEP_CAP = 60

const HUMAN_STATUS_PENDING = 'pending_verification'
const HUMAN_STATUS_ACTIVE = 'active'

// Domain allow-list — operator-tunable via `_config` key
// `identity.allowed_email_domains` (JSON array of lowercase host strings).
// When the key is unset, the in-code default below is used; this keeps
// fresh deploys functional and lets operators narrow or widen the set
// at runtime via admin-api without redeploy. The list targets major
// portals with established account-hygiene practices.
export const ALLOWED_EMAIL_DOMAINS_CONFIG_KEY = 'identity.allowed_email_domains'

export const DEFAULT_ALLOWED_EMAIL_DOMAINS: readonly string[] = [
  // Google
  'gmail.com', 'googlemail.com',
  // Microsoft
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'microsoft.com',
  // Apple
  'icloud.com', 'me.com', 'mac.com',
  // Yahoo
  'yahoo.com', 'yahoo.co.kr',
  // Korean portals
  'naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'nate.com',
]

// ── deps ───────────────────────────────────────────────────────────

export type HumanService = ReturnType<typeof createHumanService>

export type HumanServiceDeps = {
  db: Db
  /** Peppered SHA-256 input. Reuse `_config.enrollment_pepper`. */
  pepper: Uint8Array
  /** Mint a `hu_<26-char ULID>`. */
  mintHumanId: () => string
  /** Mint a `hev_<26-char ULID>`. */
  mintVerificationId: () => string
  /** Runtime config — used to read the email-domain allow-list. */
  config: ConfigReader
  /** Inject for tests; defaults to `Date.now`. */
  now?: () => number
  /** Inject for tests; defaults to `crypto.getRandomValues`-backed 6-digit string. */
  generateCode?: () => string
}

// ── helpers ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/

function isValidEmail(s: string): boolean {
  if (s.length > 254) return false
  return EMAIL_RE.test(s)
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).toLowerCase()
}

async function loadAllowedDomains(config: ConfigReader): Promise<string[]> {
  const entry = await config.get<unknown>(ALLOWED_EMAIL_DOMAINS_CONFIG_KEY)
  if (!entry || !Array.isArray(entry.value)) {
    return [...DEFAULT_ALLOWED_EMAIL_DOMAINS]
  }
  return entry.value
    .map((d) => (typeof d === 'string' ? d.trim().toLowerCase() : ''))
    .filter((d) => d.length > 0)
}

async function hashCode(code: string, pepper: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder().encode(code)
  const buf = new Uint8Array(pepper.length + enc.length)
  buf.set(pepper, 0)
  buf.set(enc, pepper.length)
  const out = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(out)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function defaultGenerateCode(): string {
  // 000000..999999, zero-padded, drawn from a uniform random.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const n = (buf[0] ?? 0) % 1_000_000
  return n.toString().padStart(6, '0')
}

function nextResendAt(lastSentAt: Date, resendCount: number): Date {
  const stepMinutes = Math.min(resendCount + 1, RESEND_STEP_CAP)
  return new Date(lastSentAt.getTime() + stepMinutes * RESEND_STEP_MS)
}

// ── public shape ───────────────────────────────────────────────────

/** Returned to the caller (api router). The router hands `code` to the
 *  Notifier and `human` / `verification` to the HTTP response. */
export type StartResult = {
  human: HumanRow
  verification: HumanEmailVerificationRow
  code: string
}

export type ResendResult = {
  verification: HumanEmailVerificationRow
  code: string
}

// ── service ────────────────────────────────────────────────────────

export function createHumanService(deps: HumanServiceDeps) {
  const now = deps.now ?? Date.now
  const generateCode = deps.generateCode ?? defaultGenerateCode
  const verifications = createHumanEmailVerificationRepo(deps.db)

  return {
    /**
     * Start a registration. Creates the principal + human (pending) +
     * verification row in one transactional flow. When a previous
     * pending row for the same email has expired, it is reaped and the
     * new registration proceeds. An active human for the same email is
     * a hard conflict.
     */
    async start(input: { email: string; displayName?: string }): Promise<StartResult> {
      const email = input.email.trim().toLowerCase()
      if (!isValidEmail(email)) {
        throw new HumanError('email_invalid', 'email is not a valid address')
      }

      const allowedDomains = await loadAllowedDomains(deps.config)
      const domain = extractDomain(email)
      if (!allowedDomains.includes(domain)) {
        throw new HumanError(
          'email_domain_not_allowed',
          'email domain is not in the allow-list',
          { domain, allowed: allowedDomains },
        )
      }

      const tNow = new Date(now())

      const existingHuman = await deps.db
        .select()
        .from(human)
        .where(eq(human.email, email))
        .limit(1)

      if (existingHuman[0]) {
        const h = existingHuman[0]
        if (h.status === HUMAN_STATUS_ACTIVE) {
          throw new HumanError(
            'email_already_active',
            'a verified human already owns this email',
          )
        }
        // Pending — check if its verification is still alive.
        const v = await verifications.findByPrincipal(h.principalId)
        if (v && v.expiresAt.getTime() > tNow.getTime()) {
          throw new HumanError(
            'email_already_pending',
            'a pending registration exists for this email',
            { id: h.principalId, expires_at: v.expiresAt.toISOString() },
          )
        }
        // Expired — reap and start over with the same principal/human.
        if (v) await verifications.deleteByPrincipal(h.principalId)
        return await mintVerification(deps, h, tNow, generateCode)
      }

      // Fresh registration: principal + human + verification.
      const humanId = deps.mintHumanId()
      await deps.db.insert(principal).values({
        principalId: humanId,
        kind: 'human',
      })
      const [createdHuman] = await deps.db
        .insert(human)
        .values({
          principalId: humanId,
          email,
          displayName: input.displayName ?? null,
          status: HUMAN_STATUS_PENDING,
        })
        .returning()
      if (!createdHuman) {
        throw new Error('human insert returned no row')
      }
      return await mintVerification(deps, createdHuman, tNow, generateCode)
    },

    /**
     * Verify the submitted code against the peppered hash. On success
     * flips `human.status` to active and stamps `verified_at`.
     */
    async verify(humanId: string, code: string): Promise<HumanRow> {
      const tNow = new Date(now())
      const v = await verifications.findByPrincipal(humanId)
      if (!v) throw new HumanError('human_not_found', 'no pending verification for this human')
      if (v.verifiedAt) {
        throw new HumanError('human_already_verified', 'this human is already verified')
      }
      if (v.expiresAt.getTime() <= tNow.getTime()) {
        throw new HumanError('verification_expired', 'verification window has elapsed')
      }
      const presented = await hashCode(code, deps.pepper)
      if (!constantTimeEqual(presented, v.codeHash)) {
        throw new HumanError('verification_code_invalid', 'verification code does not match')
      }
      await verifications.markVerified(humanId, tNow)
      const [updated] = await deps.db
        .update(human)
        .set({ status: HUMAN_STATUS_ACTIVE, updatedAt: tNow })
        .where(eq(human.principalId, humanId))
        .returning()
      if (!updated) throw new Error('human update returned no row')
      return updated
    },

    /**
     * Re-issue a fresh code. The 30-minute absolute expiry is *not*
     * extended — it always anchors to the original creation time.
     * The send is rate-limited via the arithmetic backoff schedule.
     */
    async requestResend(humanId: string): Promise<ResendResult> {
      const tNow = new Date(now())
      const v = await verifications.findByPrincipal(humanId)
      if (!v) throw new HumanError('human_not_found', 'no pending verification for this human')
      if (v.verifiedAt) {
        throw new HumanError('human_already_verified', 'this human is already verified')
      }
      if (v.expiresAt.getTime() <= tNow.getTime()) {
        throw new HumanError('verification_expired', 'verification window has elapsed')
      }
      if (v.nextResendAt.getTime() > tNow.getTime()) {
        throw new HumanError('resend_too_soon', 'resend is rate limited', {
          can_resend_at: v.nextResendAt.toISOString(),
        })
      }
      const code = generateCode()
      const codeHash = await hashCode(code, deps.pepper)
      const newCount = v.resendCount + 1
      const next = nextResendAt(tNow, newCount)
      const updated = await verifications.updateResend(humanId, {
        codeHash,
        lastSentAt: tNow,
        nextResendAt: next,
        resendCount: newCount,
      })
      if (!updated) throw new Error('verification update returned no row')
      return { verification: updated, code }
    },

    /** Read-only lookup used by GET /v1/humans/:id (if exposed). */
    findById: async (humanId: string): Promise<HumanRow | undefined> => {
      const rows = await deps.db.select().from(human).where(eq(human.principalId, humanId)).limit(1)
      return rows[0]
    },
  }
}

async function mintVerification(
  deps: HumanServiceDeps,
  h: HumanRow,
  tNow: Date,
  generateCode: () => string,
): Promise<StartResult> {
  const code = generateCode()
  const codeHash = await hashCode(code, deps.pepper)
  const verificationId = deps.mintVerificationId()
  const nextResend = nextResendAt(tNow, 0)
  const expiresAt = new Date(tNow.getTime() + VERIFICATION_TTL_MS)
  const [v] = await deps.db
    .insert(humanEmailVerification)
    .values({
      verificationId,
      principalId: h.principalId,
      codeHash,
      expiresAt,
      lastSentAt: tNow,
      nextResendAt: nextResend,
      resendCount: 0,
    })
    .returning()
  if (!v) throw new Error('human_email_verification insert returned no row')
  return { human: h, verification: v, code }
}
