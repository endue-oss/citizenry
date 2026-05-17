#!/usr/bin/env node
// Idempotently provision Cloudflare resources (D1 + Hyperdrive).
//
// Required env:
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, IDENTITY_DATABASE_URL
// Required env (when run by GitHub Actions): GITHUB_OUTPUT
//
// Looks up resources by name. Creates them if missing; updates Hyperdrive
// origin if it already exists. Writes resource IDs to $GITHUB_OUTPUT for
// downstream steps to consume.

import { appendFileSync } from 'node:fs'

const D1_NAME = 'citizenry-vault'
const HD_NAME = 'citizenry-identity'

const {
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
  IDENTITY_DATABASE_URL: pgUrl,
  GITHUB_OUTPUT: outFile,
} = process.env

for (const [k, v] of Object.entries({
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
  IDENTITY_DATABASE_URL: pgUrl,
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

function parsePgUrl(raw) {
  const u = new URL(raw)
  const scheme = u.protocol.replace(/:$/, '').replace(/^postgres$/, 'postgresql')
  if (scheme !== 'postgresql') {
    throw new Error(`IDENTITY_DATABASE_URL must use postgres/postgresql scheme (got: ${u.protocol})`)
  }
  return {
    scheme,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
  }
}

async function ensureD1() {
  const list = await cf('GET', `/accounts/${account}/d1/database?name=${encodeURIComponent(D1_NAME)}`)
  const existing = (list || []).find((db) => db.name === D1_NAME)
  if (existing) {
    console.log(`D1 ${D1_NAME} exists (${existing.uuid})`)
    return existing.uuid
  }
  console.log(`Creating D1 ${D1_NAME}…`)
  const created = await cf('POST', `/accounts/${account}/d1/database`, { name: D1_NAME })
  console.log(`D1 ${D1_NAME} created (${created.uuid})`)
  return created.uuid
}

async function ensureHyperdrive(origin) {
  const list = await cf('GET', `/accounts/${account}/hyperdrive/configs`)
  const existing = (list || []).find((c) => c.name === HD_NAME)
  if (existing) {
    console.log(`Hyperdrive ${HD_NAME} exists (${existing.id}); updating origin`)
    await cf('PATCH', `/accounts/${account}/hyperdrive/configs/${existing.id}`, { origin })
    return existing.id
  }
  console.log(`Creating Hyperdrive ${HD_NAME}…`)
  const created = await cf('POST', `/accounts/${account}/hyperdrive/configs`, {
    name: HD_NAME,
    origin,
  })
  console.log(`Hyperdrive ${HD_NAME} created (${created.id})`)
  return created.id
}

const origin = parsePgUrl(pgUrl)
const d1Id = await ensureD1()
const hdId = await ensureHyperdrive(origin)

if (outFile) {
  appendFileSync(outFile, `d1_vault_id=${d1Id}\n`)
  appendFileSync(outFile, `hyperdrive_identity_id=${hdId}\n`)
}
console.log(`\nProvisioning complete.`)
