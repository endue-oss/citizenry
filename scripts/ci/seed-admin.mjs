#!/usr/bin/env node
// Idempotently seed the admin password into the config D1 store. Runs
// in the bootstrap-secrets job, after migrations have applied the
// `config` table in citizenry-config-db.
//
// Key: `admin.password` (plaintext string, JSON-stringified by the
// config storage convention — i.e. the literal cell value is
// `"the-password"`, surrounding quotes included).
//
// Inputs (env):
//   ADMIN_PASSWORD   Optional. If set, the value is upserted, rotating
//                    the existing password. If unset and no row exists
//                    yet, a 32-character random passphrase is generated
//                    and inserted. If unset and a row already exists,
//                    the existing row is left untouched.
//
// Delivery to the operator: this script intentionally NEVER prints the
// password to stdout/stderr — public-repo workflow logs are visible to
// anyone. The operator retrieves the value via their Cloudflare
// credential channel:
//
//   wrangler d1 execute citizenry-config-db --remote \
//     --command="SELECT config_value FROM config WHERE config_key='admin.password';"
//
// The cell value is JSON-encoded; strip the surrounding quotes (or pipe
// through `jq -r`) to get the raw password.

import { createHash, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const PREFIX = process.env.SERVICE_PREFIX || 'citizenry'
const D1_NAME = `${PREFIX}-config-db`
const KEY = 'admin.password'

// Crockford base32 — readable, no homoglyph confusion.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const generatePassword = (chars = 32) => {
  const buf = randomBytes(chars)
  let s = ''
  for (let i = 0; i < chars; i++) s += ALPHABET[(buf[i] ?? 0) % ALPHABET.length]
  return s
}

// Wrangler `d1 execute` accepts arbitrary SQL but interpolating strings
// is dangerous. We hex-encode the password and decode in SQL.
const sqlHex = (s) => Buffer.from(s, 'utf8').toString('hex')
const sqlString = (hex) => `CAST(X'${hex}' AS TEXT)`

const runD1 = (sql) =>
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
      cwd: 'apps/api',
      stdio: ['ignore', 'pipe', 'inherit'],
      encoding: 'utf8',
    },
  )

const hasExistingRow = () => {
  const out = runD1(
    `SELECT 1 AS hit FROM config WHERE config_key='${KEY}' LIMIT 1;`,
  )
  try {
    const parsed = JSON.parse(out)
    const rows = parsed?.[0]?.results ?? []
    return rows.length > 0
  } catch {
    return false
  }
}

const upsert = (password) => {
  // Stored value follows the packages/config convention: JSON-stringified.
  // For a string that's `"the-password"`.
  const jsonValue = JSON.stringify(password)
  // Crockford base32 ULID-style id, generated in JS (SQLite has no
  // native ULID). 26 chars of [0-9A-HJKMNP-TV-Z].
  const id = `cfg_${generatePassword(26)}`
  const valHex = sqlHex(jsonValue)
  const idHex = sqlHex(id)
  const keyHex = sqlHex(KEY)

  const sql = `
INSERT INTO config (config_id, config_key, config_value, updated_at, updated_by)
VALUES (${sqlString(idHex)}, ${sqlString(keyHex)}, ${sqlString(valHex)}, unixepoch() * 1000, 'seed-admin')
ON CONFLICT(config_key) DO UPDATE SET
  config_value = excluded.config_value,
  updated_at   = unixepoch() * 1000,
  updated_by   = 'seed-admin';
`.trim()

  runD1(sql)
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

if (ADMIN_PASSWORD && ADMIN_PASSWORD.length > 0) {
  console.log('seed-admin: ADMIN_PASSWORD provided — rotating admin.password row')
  upsert(ADMIN_PASSWORD)
  const fingerprint = createHash('sha256').update(ADMIN_PASSWORD).digest('hex').slice(0, 12)
  console.log(`seed-admin: admin.password upserted (fingerprint: ${fingerprint})`)
} else if (hasExistingRow()) {
  console.log('seed-admin: existing admin.password row found — leaving it untouched')
} else {
  // No env override and no existing row → generate a fresh password
  // and insert it. The operator retrieves it via wrangler.
  console.log('seed-admin: no admin.password row found — generating one')
  const generated = generatePassword(32)
  upsert(generated)
  const fingerprint = createHash('sha256').update(generated).digest('hex').slice(0, 12)
  console.log(`seed-admin: admin.password inserted (fingerprint: ${fingerprint})`)
  console.log(
    `seed-admin: retrieve with — wrangler d1 execute ${D1_NAME} --remote \\\n` +
      `  --command="SELECT config_value FROM config WHERE config_key='${KEY}';"`,
  )
}
