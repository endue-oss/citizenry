#!/usr/bin/env node
// Rewrite committed wrangler.toml files in-place with real Cloudflare IDs
// and per-fork configuration values.
//
// Required env:
//   D1_VAULT_ID     UUID returned by provision.mjs
//   D1_IDENTITY_ID  UUID returned by provision.mjs
//
// Optional env (override [vars] blocks):
//   ISSUER_HOST     defaults to the value already in wrangler.toml
//   JWT_AUDIENCE    defaults to the value already in wrangler.toml
//
// Optional env (admin-api):
//   API_BASE_URL    overrides admin-api's [vars] API_BASE_URL — usually the api
//                   worker's workers.dev subdomain or a custom domain.
//
// Targets:
//   apps/api/wrangler.toml         — DB_VAULT, DB_IDENTITY
//   apps/admin-api/wrangler.toml   — vars only (no direct DB access)
//   apps/mcp/wrangler.toml         — no DB bindings
//   apps/migrator/wrangler.toml    — DB_VAULT, DB_IDENTITY (migration runner worker)
//
// The replacement is anchored on `binding = "..."`, so only the intended binding is touched.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const { D1_VAULT_ID, D1_IDENTITY_ID, ISSUER_HOST, JWT_AUDIENCE, API_BASE_URL } = process.env

if (!D1_VAULT_ID || !D1_IDENTITY_ID) {
  console.error('::error::render-wrangler.mjs: D1_VAULT_ID and D1_IDENTITY_ID required')
  process.exit(1)
}

const TARGETS = [
  'apps/api/wrangler.toml',
  'apps/admin-api/wrangler.toml',
  'apps/mcp/wrangler.toml',
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

let changed = 0
for (const path of TARGETS) {
  if (!existsSync(path)) continue
  const before = readFileSync(path, 'utf8')
  let after = before
  after = patchD1(after, 'DB_VAULT', D1_VAULT_ID)
  after = patchD1(after, 'DB_IDENTITY', D1_IDENTITY_ID)
  after = patchVar(after, 'ISSUER_HOST', ISSUER_HOST)
  after = patchVar(after, 'JWT_AUDIENCE', JWT_AUDIENCE)
  after = patchVar(after, 'API_BASE_URL', API_BASE_URL)
  if (after !== before) {
    writeFileSync(path, after)
    console.log(`patched ${path}`)
    changed++
  } else {
    console.log(`no changes for ${path}`)
  }
}
console.log(`\n${changed} file(s) patched`)
