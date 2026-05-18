#!/usr/bin/env node
// Idempotently seed (or rotate) the admin_account row used by
// apps/admin-api for ID/PW login. Runs in the bootstrap-secrets job,
// after migrations have applied the admin_account table.
//
// Inputs (env):
//   ADMIN_ID         (default "admin")
//   ADMIN_PASSWORD   (required on first run; rotates on subsequent runs)
//
// What it does:
//   1) Derive a fresh 32-byte salt + PBKDF2-SHA-256 hash (200k iters).
//   2) Hex-encode both and upsert into admin_account via wrangler d1
//      execute (against ${SERVICE_PREFIX}-identity-db).
//
// Why not pure SQL: SQLite has no PBKDF2 primitive and the bootstrap
// script runs in bash. Node has crypto.subtle, so we do it here.

import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const ITER = 200_000
const SALT_BYTES = 32
const HASH_BYTES = 32

const PREFIX = process.env.SERVICE_PREFIX || 'citizenry'
const D1_NAME = `${PREFIX}-identity-db`
const ADMIN_ID = (process.env.ADMIN_ID || 'admin').trim()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (!ADMIN_PASSWORD) {
  console.log('seed-admin: ADMIN_PASSWORD not set — skipping (existing credential, if any, is left untouched)')
  process.exit(0)
}

const salt = randomBytes(SALT_BYTES)
const hash = pbkdf2Sync(ADMIN_PASSWORD, salt, ITER, HASH_BYTES, 'sha256')

const saltHex = salt.toString('hex')
const hashHex = hash.toString('hex')

// D1's `execute` accepts X'<hex>' for BLOB literals.
const sql = `
INSERT INTO admin_account (admin_id, password_hash, password_salt, iterations, updated_at)
VALUES ('${ADMIN_ID.replace(/'/g, "''")}', X'${hashHex}', X'${saltHex}', ${ITER}, unixepoch() * 1000)
ON CONFLICT(admin_id) DO UPDATE SET
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  iterations    = excluded.iterations,
  updated_at    = unixepoch() * 1000;
`.trim()

console.log(`seed-admin: upserting admin_account row for admin_id="${ADMIN_ID}" (iter=${ITER}, salt=${SALT_BYTES}B)`)

execFileSync(
  'pnpm',
  [
    'exec',
    'wrangler',
    'd1',
    'execute',
    D1_NAME,
    '--remote',
    '--command',
    sql,
    '--json',
  ],
  {
    cwd: 'apps/admin-api',
    stdio: ['ignore', 'inherit', 'inherit'],
  },
)

// Mask the password hash from any later workflow log line that
// might accidentally echo it (defense in depth — the workflow
// already maskes ADMIN_PASSWORD).
const fingerprint = createHash('sha256').update(hashHex).digest('hex').slice(0, 12)
console.log(`seed-admin: admin_account upserted (hash fingerprint: ${fingerprint})`)
