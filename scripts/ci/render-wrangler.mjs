#!/usr/bin/env node
// Rewrite committed wrangler.toml files in-place with real Cloudflare IDs
// and per-fork configuration values.
//
// Required env:
//   D1_VAULT_ID            UUID returned by provision.mjs
//   HYPERDRIVE_IDENTITY_ID UUID returned by provision.mjs
//
// Optional env (override [vars] blocks):
//   ISSUER_HOST       defaults to the value already in wrangler.toml
//   JWT_AUDIENCE      defaults to the value already in wrangler.toml
//
// Targets:
//   apps/api/wrangler.toml
//   apps/admin-api/wrangler.toml
//   apps/mcp/wrangler.toml
//
// The substitutions are anchored on `binding = "DB_VAULT"` / `binding = "HYPERDRIVE"`
// so we only touch the intended bindings, not unrelated ones.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const { D1_VAULT_ID, HYPERDRIVE_IDENTITY_ID, ISSUER_HOST, JWT_AUDIENCE } = process.env

if (!D1_VAULT_ID || !HYPERDRIVE_IDENTITY_ID) {
  console.error('::error::render-wrangler.mjs: D1_VAULT_ID and HYPERDRIVE_IDENTITY_ID required')
  process.exit(1)
}

const TARGETS = [
  'apps/api/wrangler.toml',
  'apps/admin-api/wrangler.toml',
  'apps/mcp/wrangler.toml',
]

function patchD1(content, id) {
  return content.replace(
    /(\[\[d1_databases\]\][^\[]*?binding\s*=\s*"DB_VAULT"[^\[]*?database_id\s*=\s*)"[^"]*"/m,
    `$1"${id}"`,
  )
}

function patchHyperdrive(content, id) {
  return content.replace(
    /(\[\[hyperdrive\]\][^\[]*?binding\s*=\s*"HYPERDRIVE"[^\[]*?\nid\s*=\s*)"[^"]*"/m,
    `$1"${id}"`,
  )
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
  after = patchD1(after, D1_VAULT_ID)
  after = patchHyperdrive(after, HYPERDRIVE_IDENTITY_ID)
  after = patchVar(after, 'ISSUER_HOST', ISSUER_HOST)
  after = patchVar(after, 'JWT_AUDIENCE', JWT_AUDIENCE)
  if (after !== before) {
    writeFileSync(path, after)
    console.log(`patched ${path}`)
    changed++
  } else {
    console.log(`no changes for ${path}`)
  }
}
console.log(`\n${changed} file(s) patched`)
