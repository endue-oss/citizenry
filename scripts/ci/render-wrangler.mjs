#!/usr/bin/env node
// Rewrite committed wrangler.toml files in-place with real Cloudflare IDs
// and per-fork configuration values.
//
// Required env:
//   D1_VAULT_ID     UUID returned by provision.mjs
//   D1_IDENTITY_ID  UUID returned by provision.mjs
//   D1_MAIL_ID      UUID returned by provision.mjs
//   D1_CONFIG_ID    UUID returned by provision.mjs
//
// Optional env:
//   SERVICE_PREFIX  Override the default "citizenry" prefix used in worker
//                   and D1 names. Substitutes leading `citizenry-` in any
//                   `name = "citizenry-..."` and `database_name = "citizenry-..."`
//                   line, keeping the suffix intact. JWT_AUDIENCE / ISSUER_HOST
//                   and other vars are not touched — those are protocol-level
//                   values, not infrastructure names.
//
// Optional env (override [vars] blocks):
//   ISSUER_HOST     defaults to the value already in wrangler.toml
//   JWT_AUDIENCE    defaults to the value already in wrangler.toml
//   MAIL_DOMAIN     defaults to the value already in wrangler.toml
//
// Optional env (admin-api):
//   API_BASE_URL    overrides admin-api's [vars] API_BASE_URL — usually the api
//                   worker's workers.dev subdomain or a custom domain.
//
// Targets:
//   apps/api/wrangler.toml         — DB_VAULT, DB_IDENTITY, DB_CONFIG
//   apps/admin-api/wrangler.toml   — vars only (no direct DB access)
//   apps/mcp/wrangler.toml         — no DB bindings
//   apps/mail/wrangler.toml        — DB_IDENTITY, DB_MAIL, DB_CONFIG
//   apps/migrator/wrangler.toml    — DB_IDENTITY, DB_VAULT, DB_MAIL, DB_CONFIG (migration runner)
//
// The replacement is anchored on `binding = "..."`, so only the intended binding is touched.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const {
  D1_VAULT_ID,
  D1_IDENTITY_ID,
  D1_MAIL_ID,
  D1_CONFIG_ID,
  ISSUER_HOST,
  JWT_AUDIENCE,
  MAIL_DOMAIN,
  API_BASE_URL,
} = process.env

const SERVICE_PREFIX = process.env.SERVICE_PREFIX || 'citizenry'

if (!D1_VAULT_ID || !D1_IDENTITY_ID || !D1_MAIL_ID || !D1_CONFIG_ID) {
  console.error(
    '::error::render-wrangler.mjs: D1_VAULT_ID, D1_IDENTITY_ID, D1_MAIL_ID, and D1_CONFIG_ID required',
  )
  process.exit(1)
}

const TARGETS = [
  'apps/api/wrangler.toml',
  'apps/admin-api/wrangler.toml',
  'apps/mcp/wrangler.toml',
  'apps/mail/wrangler.toml',
  'apps/migrator/wrangler.toml',
]

function patchD1(content, binding, id) {
  const re = new RegExp(
    `(\\[\\[d1_databases\\]\\][^\\[]*?binding\\s*=\\s*"${binding}"[^\\[]*?database_id\\s*=\\s*)"[^"]*"`,
    'm',
  )
  return content.replace(re, `$1"${id}"`)
}

function patchVar(content, key, value) {
  if (value === undefined) return content
  return content.replace(new RegExp(`(${key}\\s*=\\s*)"[^"]*"`, 'g'), `$1"${value}"`)
}

/**
 * Substitute the resource-name prefix in `name = "citizenry-..."` and
 * `database_name = "citizenry-..."` lines. No-op when SERVICE_PREFIX is
 * left at the default ("citizenry") — the committed file already has the
 * right value.
 */
function patchPrefix(content, prefix) {
  if (prefix === 'citizenry') return content
  return content
    .replace(/(^|\n)(\s*name\s*=\s*)"citizenry-/g, `$1$2"${prefix}-`)
    .replace(/(^|\n)(\s*database_name\s*=\s*)"citizenry-/g, `$1$2"${prefix}-`)
    .replace(/(^|\n)(\s*service\s*=\s*)"citizenry-/g, `$1$2"${prefix}-`)
}

let changed = 0
for (const path of TARGETS) {
  if (!existsSync(path)) continue
  const before = readFileSync(path, 'utf8')
  let after = before
  after = patchD1(after, 'DB_VAULT', D1_VAULT_ID)
  after = patchD1(after, 'DB_IDENTITY', D1_IDENTITY_ID)
  after = patchD1(after, 'DB_MAIL', D1_MAIL_ID)
  after = patchD1(after, 'DB_CONFIG', D1_CONFIG_ID)
  after = patchPrefix(after, SERVICE_PREFIX)
  after = patchVar(after, 'ISSUER_HOST', ISSUER_HOST)
  after = patchVar(after, 'JWT_AUDIENCE', JWT_AUDIENCE)
  after = patchVar(after, 'MAIL_DOMAIN', MAIL_DOMAIN)
  after = patchVar(after, 'API_BASE_URL', API_BASE_URL)
  if (after !== before) {
    writeFileSync(path, after)
    console.log(`patched ${path}`)
    changed++
  } else {
    console.log(`no changes for ${path}`)
  }
}
console.log(`\nprefix=${SERVICE_PREFIX}, ${changed} file(s) patched`)
