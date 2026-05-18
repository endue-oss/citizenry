#!/usr/bin/env node
// Idempotently provision Cloudflare D1 databases (identity + vault + mail + config).
//
// Required env:
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
// Required env (when run by GitHub Actions): GITHUB_OUTPUT
// Optional env:
//   SERVICE_PREFIX  Override the default "citizenry" prefix used in resource
//                   names. Forks that share a Cloudflare account set this
//                   to keep their resources distinct.
//
// Naming convention: `${SERVICE_PREFIX}-<domain>-db`. Defaults to
// `citizenry-identity-db`, `citizenry-vault-db`, `citizenry-mail-db`,
// `citizenry-config-db`.
//
// Looks up each D1 by name; creates if missing. Writes UUIDs to $GITHUB_OUTPUT
// for downstream steps (render-wrangler.mjs) to consume.

import { appendFileSync } from 'node:fs'

const PREFIX = process.env.SERVICE_PREFIX || 'citizenry'

const D1_IDENTITY_NAME = `${PREFIX}-identity-db`
const D1_VAULT_NAME = `${PREFIX}-vault-db`
const D1_MAIL_NAME = `${PREFIX}-mail-db`
const D1_CONFIG_NAME = `${PREFIX}-config-db`

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

console.log(`Provisioning with prefix: ${PREFIX}`)

const d1IdentityId = await ensureD1(D1_IDENTITY_NAME)
const d1VaultId = await ensureD1(D1_VAULT_NAME)
const d1MailId = await ensureD1(D1_MAIL_NAME)
const d1ConfigId = await ensureD1(D1_CONFIG_NAME)

if (outFile) {
  appendFileSync(outFile, `d1_identity_id=${d1IdentityId}\n`)
  appendFileSync(outFile, `d1_vault_id=${d1VaultId}\n`)
  appendFileSync(outFile, `d1_mail_id=${d1MailId}\n`)
  appendFileSync(outFile, `d1_config_id=${d1ConfigId}\n`)
  appendFileSync(outFile, `d1_identity_name=${D1_IDENTITY_NAME}\n`)
  appendFileSync(outFile, `d1_vault_name=${D1_VAULT_NAME}\n`)
  appendFileSync(outFile, `d1_mail_name=${D1_MAIL_NAME}\n`)
  appendFileSync(outFile, `d1_config_name=${D1_CONFIG_NAME}\n`)
  appendFileSync(outFile, `service_prefix=${PREFIX}\n`)
}
console.log(`\nProvisioning complete.`)
