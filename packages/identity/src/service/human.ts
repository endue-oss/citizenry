// Human self-registration with email verification (RFC-0004 model).
//
// Three operations only:
//
//   startCreate({ email })   POST /v1/humans         — fresh email only
//   startRotate({ email })   POST /v1/humans/rotate  — re-mail a code to any
//                                                       existing row; silent
//                                                       on unknown email
//   verify({ email, code })  POST /v1/humans/verify  — flips pending→active
//                                                       and/or rotates the
//                                                       owner's API-Key
//
// All verify failure modes (no row / wrong code / expired window) collapse
// into a single `invalid_credentials` to keep the endpoint enumeration-safe.
// API-Key minting is handled by service/api_key.ts; this module only owns
// the verification row + human lifecycle.

import { eq } from 'drizzle-orm'
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
// Only the verification-code template is used in this iteration — the
// API-Key is surfaced via the HTTP response, never mailed.

export type NotifyPayload = {
  template: 'human_verification'
  context: {
    code: string
    expiresInMinutes: number
  }
}

export type Notifier = {
  send(
    args: NotifyPayload & {
      to: Array<{ name?: string; mail: string }>
    },
  ): Promise<{ delivered: boolean; outbound_log_id: string; status: string }>
}

// ── domain errors ──────────────────────────────────────────────────

export type HumanErrorCode =
  /** Email format / length violation. 400. */
  | 'email_invalid'
  /** Domain not on the operator allow-list. 422. */
  | 'email_domain_not_allowed'
  /** POST /v1/humans called with an email that already has a row. 409. */
  | 'email_already_in_use'
  /** Any verify failure — code wrong / no row / expired. 401. */
  | 'invalid_credentials'

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

const HUMAN_STATUS_PENDING = 'pending_verification'
const HUMAN_STATUS_ACTIVE = 'active'

// Domain allow-list — operator-tunable via `_config` key. When the key
// is unset, the in-code default below is used. The set targets major
// portals + ISP/national webmail providers with ≥50M users.
export const ALLOWED_EMAIL_DOMAINS_CONFIG_KEY = 'identity.allowed_email_domains'

export const DEFAULT_ALLOWED_EMAIL_DOMAINS: readonly string[] = [
  // Korea
  'naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'nate.com',
  // China — top 5
  'qq.com', 'foxmail.com',
  '163.com', '126.com', 'yeah.net',
  'sina.com', 'sina.cn',
  'sohu.com',
  'aliyun.com',
  // Global 50M+
  'gmail.com', 'googlemail.com',
  'icloud.com', 'me.com', 'mac.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'yahoo.co.jp', 'yahoo.co.kr', 'yahoo.fr', 'yahoo.co.uk',
  'yahoo.de', 'yahoo.com.br', 'yahoo.com.mx',
  'proton.me', 'protonmail.com', 'pm.me',
  'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru',
  'yandex.com', 'yandex.ru', 'ya.ru',
]

// ── deps ───────────────────────────────────────────────────────────

export type HumanService = ReturnType<typeof createHumanService>

export type HumanServiceDeps = {
  db: Db
  /** Peppered SHA-256 input. Shared with the API-Key hash. */
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
  // 000000..999999, zero-padded, drawn from a uniform random source.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const n = (buf[0] ?? 0) % 1_000_000
  return n.toString().padStart(6, '0')
}

// ── public shapes ──────────────────────────────────────────────────

/** Result of startCreate / startRotate — the router uses this to mail
 *  the code via the Notifier. */
export type StartResult = {
  human: HumanRow
  verification: HumanEmailVerificationRow
  code: string
}

/** Result of verify — caller (router) chains this into api_key.issueReplacing. */
export type VerifyResult = {
  human: HumanRow
}

// ── service ────────────────────────────────────────────────────────

export function createHumanService(deps: HumanServiceDeps) {
  const now = deps.now ?? Date.now
  const generateCode = deps.generateCode ?? defaultGenerateCode
  const verifications = createHumanEmailVerificationRepo(deps.db)

  async function normaliseAndValidate(rawEmail: string): Promise<string> {
    const email = rawEmail.trim().toLowerCase()
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
    return email
  }

  async function mintFreshVerification(h: HumanRow, tNow: Date): Promise<StartResult> {
    const code = generateCode()
    const codeHash = await hashCode(code, deps.pepper)
    const verificationId = deps.mintVerificationId()
    const expiresAt = new Date(tNow.getTime() + VERIFICATION_TTL_MS)

    // Replace any existing verification for the principal — UNIQUE
    // (principal_id) on the table means we drop the old before insert.
    await verifications.deleteByPrincipal(h.principalId)

    const [v] = await deps.db
      .insert(humanEmailVerification)
      .values({
        verificationId,
        principalId: h.principalId,
        codeHash,
        expiresAt,
        lastSentAt: tNow,
        nextResendAt: tNow,
        resendCount: 0,
      })
      .returning()
    if (!v) throw new Error('human_email_verification insert returned no row')
    return { human: h, verification: v, code }
  }

  return {
    /**
     * Fresh-email registration. Mints principal + human(pending) +
     * verification row and returns the code for the router to mail.
     *
     * Errors:
     *   - email_invalid          (400)
     *   - email_domain_not_allowed (422)
     *   - email_already_in_use   (409) — rotation lives at /humans/rotate
     */
    async startCreate(input: {
      email: string
      displayName?: string
    }): Promise<StartResult> {
      const email = await normaliseAndValidate(input.email)
      const tNow = new Date(now())

      const existing = await deps.db
        .select()
        .from(human)
        .where(eq(human.email, email))
        .limit(1)
      if (existing[0]) {
        throw new HumanError(
          'email_already_in_use',
          'a row for this email already exists',
        )
      }

      const humanId = deps.mintHumanId()
      await deps.db.insert(principal).values({ principalId: humanId, kind: 'human' })
      const [createdHuman] = await deps.db
        .insert(human)
        .values({
          principalId: humanId,
          email,
          displayName: input.displayName ?? null,
          status: HUMAN_STATUS_PENDING,
        })
        .returning()
      if (!createdHuman) throw new Error('human insert returned no row')
      return await mintFreshVerification(createdHuman, tNow)
    },

    /**
     * Rotation trigger. Re-mails a code to any existing row (pending or
     * active) for the supplied email. Unknown email → silent `null`
     * return (no row inserted, no error surfaced). The router wraps the
     * caller-visible response in an always-202 envelope.
     *
     * Errors that DO surface (caller body shape problem):
     *   - email_invalid          (400)
     *   - email_domain_not_allowed (422)
     */
    async startRotate(input: { email: string }): Promise<StartResult | null> {
      const email = await normaliseAndValidate(input.email)
      const tNow = new Date(now())

      const rows = await deps.db
        .select()
        .from(human)
        .where(eq(human.email, email))
        .limit(1)
      const h = rows[0]
      if (!h) return null
      return await mintFreshVerification(h, tNow)
    },

    /**
     * Submit a code + email. On success flips pending→active (if not
     * already) and consumes the verification row. The router chains
     * this into api_key.issueReplacing to mint the new API-Key.
     *
     * Every failure mode collapses to `invalid_credentials` so the
     * endpoint cannot be used as an email-existence oracle.
     */
    async verify(input: { email: string; code: string }): Promise<VerifyResult> {
      const email = input.email.trim().toLowerCase()
      const tNow = new Date(now())

      const rows = await deps.db
        .select()
        .from(human)
        .where(eq(human.email, email))
        .limit(1)
      const h = rows[0]
      if (!h) {
        throw new HumanError('invalid_credentials', 'verification failed')
      }

      const v = await verifications.findByPrincipal(h.principalId)
      if (!v) {
        throw new HumanError('invalid_credentials', 'verification failed')
      }
      if (v.expiresAt.getTime() <= tNow.getTime()) {
        throw new HumanError('invalid_credentials', 'verification failed')
      }
      const presented = await hashCode(input.code, deps.pepper)
      if (!constantTimeEqual(presented, v.codeHash)) {
        throw new HumanError('invalid_credentials', 'verification failed')
      }

      // Code accepted: flip status if pending, drop the verification
      // row (single-use), and return the human row to the caller.
      let updated: HumanRow
      if (h.status !== HUMAN_STATUS_ACTIVE) {
        const [u] = await deps.db
          .update(human)
          .set({ status: HUMAN_STATUS_ACTIVE, updatedAt: tNow })
          .where(eq(human.principalId, h.principalId))
          .returning()
        if (!u) throw new Error('human update returned no row')
        updated = u
      } else {
        updated = h
      }
      await verifications.deleteByPrincipal(h.principalId)
      return { human: updated }
    },

    /** Read-only lookup used by admin endpoints. */
    findById: async (humanId: string): Promise<HumanRow | undefined> => {
      const rows = await deps.db.select().from(human).where(eq(human.principalId, humanId)).limit(1)
      return rows[0]
    },
  }
}
