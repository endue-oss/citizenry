#!/usr/bin/env node
// Local dev seed — populates citizenry-identity-db with realistic-looking
// humans and agents so the admin UI has something to show. Bypasses the
// real verification flow (codes hashed, can't reverse) by direct-INSERT
// with status='active'.
//
// Idempotent: `INSERT OR IGNORE` on every row. Safe to run multiple times.
//
// Usage:
//   node scripts/dev/seed-humans-and-agents.mjs
//
// Requires:
//   - `wrangler` on PATH (via pnpm)
//   - apps/admin-api directory (used as the working dir for d1 execute)
//   - Local D1 already migrated. Run:
//       cd apps/admin-api
//       pnpm exec wrangler d1 migrations apply citizenry-identity-db --local

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const D1_NAME = 'citizenry-identity-db'
const WORK_DIR = "apps/api"

// ── helpers ─────────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function ulid() {
  const now = Date.now()
  const bytes = new Uint8Array(16)
  let t = now
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t & 0xff
    t = Math.floor(t / 256)
  }
  bytes.set(randomBytes(10), 6)
  let bits = 0
  let buffer = 0
  let out = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += CROCKFORD[(buffer >>> bits) & 0x1f]
    }
  }
  if (bits > 0) out += CROCKFORD[(buffer << (5 - bits)) & 0x1f]
  return out.slice(0, 26)
}

const sqlString = (s) => `CAST(X'${Buffer.from(s, 'utf8').toString('hex')}' AS TEXT)`

function d1(sql) {
  const out = execFileSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', D1_NAME, '--local', '--command', sql, '--json'],
    { cwd: WORK_DIR, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
  )
  return out
}

// ── ensure tenant + system principal ────────────────────────────────

function ensureSystemTenant() {
  // Tenant 'public' is referenced by tenant_principal_membership; ensure it exists.
  d1(
    `INSERT OR IGNORE INTO tenant (tenant_id, slug, display_name, status, kind)
     VALUES ('tn_${ulid()}', 'public', 'Public', 'active', 'local');`,
  )
}

// ── humans ──────────────────────────────────────────────────────────

const HUMAN_FIXTURES = [
  { email: 'alex@gmail.com', name: 'Alex Park', status: 'active' },
  { email: 'beatrice@outlook.com', name: 'Beatrice Choi', status: 'active' },
  { email: 'carlos@icloud.com', name: 'Carlos Mendes', status: 'active' },
  { email: 'daria@yahoo.com', name: 'Daria Kim', status: 'active' },
  { email: 'eun@naver.com', name: 'Eun-Jin Lee', status: 'active' },
  { email: 'farouk@gmail.com', name: 'Farouk Hassan', status: 'active' },
  { email: 'grace@hotmail.com', name: 'Grace Yamamoto', status: 'active' },
  { email: 'hyojin@kakao.com', name: 'Hyojin Yu', status: 'active' },
  { email: 'ivan@live.com', name: 'Ivan Petrov', status: 'active' },
  { email: 'jamila@me.com', name: 'Jamila Sow', status: 'active' },
  { email: 'kenji@daum.net', name: 'Kenji Tanaka', status: 'active' },
  { email: 'leila@yahoo.co.kr', name: 'Leila Rahmani', status: 'active' },
  { email: 'mateo@googlemail.com', name: 'Mateo Silva', status: 'pending_verification' },
  { email: 'nadia@nate.com', name: 'Nadia Sokolova', status: 'pending_verification' },
  { email: 'oscar@msn.com', name: 'Oscar Lindgren', status: 'active' },
]

function insertHuman(h, ts) {
  const principalId = `hu_${ulid()}`
  // principal row first (FK target).
  d1(
    `INSERT OR IGNORE INTO principal (principal_id, kind, created_at, updated_at)
     VALUES ('${principalId}', 'human', ${ts}, ${ts});`,
  )
  // human row — INSERT OR IGNORE on the email UNIQUE constraint means
  // re-runs are no-ops once seeded.
  d1(
    `INSERT OR IGNORE INTO human (principal_id, email, display_name, status, created_at, updated_at)
     VALUES (
       '${principalId}',
       ${sqlString(h.email)},
       ${sqlString(h.name)},
       ${sqlString(h.status)},
       ${ts},
       ${ts}
     );`,
  )
  // Look up the actual principal_id for this email (in case we hit the
  // OR IGNORE branch from a previous run — the principalId minted above
  // would not be the canonical one).
  const out = d1(
    `SELECT principal_id FROM human WHERE email = ${sqlString(h.email)} LIMIT 1;`,
  )
  try {
    const parsed = JSON.parse(out)
    const id = parsed?.[0]?.results?.[0]?.principal_id
    return { ...h, principalId: id ?? principalId }
  } catch {
    return { ...h, principalId }
  }
}

function insertApiKeyForActive(human, ts) {
  // Stub-only — store a peppered SHA-256 placeholder. The token itself
  // is not surfaced (we don't need it for admin display).
  const apiKeyId = `chk_${ulid()}`
  const hashHex = randomBytes(32).toString('hex')
  d1(
    `INSERT OR IGNORE INTO human_api_key
       (api_key_id, token_hash, owner_human_principal_id, display_name, status, created_at)
     VALUES (
       '${apiKeyId}',
       X'${hashHex}',
       '${human.principalId}',
       ${sqlString('initial')},
       'active',
       ${ts}
     );`,
  )
}

// ── agents ──────────────────────────────────────────────────────────

const AGENT_SLUGS = [
  'scout-007', 'archivist', 'compose', 'beacon', 'orca',
  'mariner', 'sage', 'kestrel', 'lyra', 'pulse',
  'voyager', 'sentinel', 'tally', 'forge', 'echo',
  'driver', 'librarian', 'minder', 'navigator', 'oracle',
  'pilot', 'quill', 'ranger', 'scribe', 'tracer',
]

function insertAgent(slug, owner, ts) {
  const principalId = `ag_${ulid()}`
  d1(
    `INSERT OR IGNORE INTO principal (principal_id, kind, created_at, updated_at)
     VALUES ('${principalId}', 'agent', ${ts}, ${ts});`,
  )
  d1(
    `INSERT OR IGNORE INTO agent
       (principal_id, slug, display_name, status, owner_human_principal_id, created_at, updated_at)
     VALUES (
       '${principalId}',
       ${sqlString(slug)},
       ${sqlString(slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()))},
       'active',
       '${owner.principalId}',
       ${ts},
       ${ts}
     );`,
  )
}

// ── main ─────────────────────────────────────────────────────────────

function main() {
  console.log(`Seeding ${D1_NAME} (local) …`)
  ensureSystemTenant()
  console.log('  tenant: public ✓')

  // Stagger timestamps so the admin list orders interestingly.
  const baseTs = Date.now() - HUMAN_FIXTURES.length * 60_000
  const humans = []
  HUMAN_FIXTURES.forEach((h, i) => {
    const ts = baseTs + i * 60_000
    const created = insertHuman(h, ts)
    humans.push(created)
    if (created.status === 'active') insertApiKeyForActive(created, ts)
    process.stdout.write(`  human ${i + 1}/${HUMAN_FIXTURES.length}: ${h.email} (${h.status})\r`)
  })
  process.stdout.write('\n')

  // Distribute agents across active humans (skip pending). Aim for at
  // least 20 agents so the admin list has scroll.
  const activeHumans = humans.filter((h) => h.status === 'active')
  if (activeHumans.length === 0) {
    console.error('  no active humans — skipping agents')
    process.exit(1)
  }
  AGENT_SLUGS.forEach((slug, i) => {
    const owner = activeHumans[i % activeHumans.length]
    const ts = baseTs + (HUMAN_FIXTURES.length + i) * 60_000
    insertAgent(slug, owner, ts)
    process.stdout.write(`  agent ${i + 1}/${AGENT_SLUGS.length}: ${slug} → ${owner.email}\r`)
  })
  process.stdout.write('\n')

  // Final tally
  const tally = (table) => {
    const out = d1(`SELECT COUNT(*) AS n FROM ${table};`)
    try {
      return JSON.parse(out)[0]?.results?.[0]?.n ?? '?'
    } catch {
      return '?'
    }
  }
  console.log()
  console.log('Done.')
  console.log(`  humans:        ${tally('human')}`)
  console.log(`  agents:        ${tally('agent')}`)
  console.log(`  api keys:      ${tally('human_api_key')}`)
  console.log(`  principals:    ${tally('principal')}`)
}

main()
