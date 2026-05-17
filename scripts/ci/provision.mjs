#!/usr/bin/env node
// Idempotently provision Cloudflare D1 databases (identity + vault).
//
// Required env:
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
// Required env (when run by GitHub Actions): GITHUB_OUTPUT
//
// Looks up each D1 by name; creates if missing. Writes UUIDs to $GITHUB_OUTPUT
// for downstream steps (render-wrangler.mjs) to consume.

import { appendFileSync } from 'node:fs'

const D1_VAULT_NAME = 'citizenry-vault'
const D1_IDENTITY_NAME = 'citizenry-identity'

const {
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
  GITHUB_OUTPUT: outFile,
} = process.env

for (const [k, v] of Object.entries({
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
})) {
  if (!v) {
    console.error(`::error::Missing required env: ${k}`)
    process.exit(1)
  }
}

const apiBase = 'https://api.cloudflare.com/client/v4'

async function cf(method, path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`CF ${method} ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  if (!json.success) {
    const errs = (json.errors || []).map((e) => `[${e.code}] ${e.message}`).join('; ')
    throw new Error(`CF ${method} ${path} failed: ${errs || `HTTP ${res.status}`}`)
  }
  return json.result
}

async function ensureD1(name) {
  const list = await cf('GET', `/accounts/${account}/d1/database?name=${encodeURIComponent(name)}`)
  const existing = (list || []).find((db) => db.name === name)
  if (existing) {
    console.log(`D1 ${name} exists (${existing.uuid})`)
    return existing.uuid
  }
  console.log(`Creating D1 ${name}…`)
  const created = await cf('POST', `/accounts/${account}/d1/database`, { name })
  console.log(`D1 ${name} created (${created.uuid})`)
  return created.uuid
}

const d1VaultId = await ensureD1(D1_VAULT_NAME)
const d1IdentityId = await ensureD1(D1_IDENTITY_NAME)

if (outFile) {
  appendFileSync(outFile, `d1_vault_id=${d1VaultId}\n`)
  appendFileSync(outFile, `d1_identity_id=${d1IdentityId}\n`)
}
console.log(`\nProvisioning complete.`)
