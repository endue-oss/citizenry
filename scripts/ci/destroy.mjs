#!/usr/bin/env node
// Destroy all Cloudflare resources created by `deploy.yml` for a given
// SERVICE_PREFIX.
//
// Targets (when SERVICE_PREFIX = "citizenry"):
//   Workers: citizenry-api, citizenry-admin-api, citizenry-mcp,
//            citizenry-mail, citizenry-migrator
//   Pages:   citizenry-admin-web, citizenry-docs
//   D1:      citizenry-identity-db, citizenry-vault-db,
//            citizenry-mail-db, citizenry-config-db
//
// Each delete tolerates a 404 so partial states can be reconciled.
// Order is Workers → Pages → D1 to drop compute before data, matching
// the inverse of provision/deploy.
//
// Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SERVICE_PREFIX

import { appendFileSync } from 'node:fs'

const {
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
  SERVICE_PREFIX: prefix,
  GITHUB_STEP_SUMMARY: summaryFile,
} = process.env

for (const [k, v] of Object.entries({
  CLOUDFLARE_API_TOKEN: token,
  CLOUDFLARE_ACCOUNT_ID: account,
  SERVICE_PREFIX: prefix,
})) {
  if (!v) {
    console.error(`::error::Missing required env: ${k}`)
    process.exit(1)
  }
}

const apiBase = 'https://api.cloudflare.com/client/v4'

const WORKERS = ['api', 'admin-api', 'mcp', 'mail', 'migrator'].map((s) => `${prefix}-${s}`)
const PAGES = ['admin-web', 'docs'].map((s) => `${prefix}-${s}`)
const D1S = ['identity-db', 'vault-db', 'mail-db', 'config-db'].map((s) => `${prefix}-${s}`)

const results = { workers: [], pages: [], d1: [] }

async function cf(method, path, { body, query } = {}) {
  const url = `${apiBase}${path}${query ? `?${new URLSearchParams(query)}` : ''}`
  const res = await fetch(url, {
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
    json = text ? JSON.parse(text) : { success: res.ok }
  } catch {
    throw new Error(`CF ${method} ${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  return { status: res.status, ok: res.ok, json }
}

function notFound({ status, json }) {
  if (status === 404) return true
  const codes = (json?.errors || []).map((e) => e.code)
  // 7003: not found path; 10007: worker script not found; 7000: not routed.
  return codes.some((c) => [7003, 10007, 7000].includes(c))
}

async function deleteWorker(name) {
  const r = await cf('DELETE', `/accounts/${account}/workers/scripts/${encodeURIComponent(name)}`, {
    query: { force: 'true' },
  })
  if (r.ok) return { name, status: 'deleted' }
  if (notFound(r)) return { name, status: 'not_found' }
  return { name, status: 'failed', error: errMsg(r) }
}

async function deletePages(name) {
  const r = await cf('DELETE', `/accounts/${account}/pages/projects/${encodeURIComponent(name)}`)
  if (r.ok) return { name, status: 'deleted' }
  if (notFound(r)) return { name, status: 'not_found' }
  return { name, status: 'failed', error: errMsg(r) }
}

async function deleteD1(name) {
  const list = await cf('GET', `/accounts/${account}/d1/database`, { query: { name } })
  if (!list.ok) return { name, status: 'failed', error: errMsg(list) }
  const match = (list.json.result || []).find((db) => db.name === name)
  if (!match) return { name, status: 'not_found' }
  const r = await cf('DELETE', `/accounts/${account}/d1/database/${match.uuid}`)
  if (r.ok) return { name, status: 'deleted', uuid: match.uuid }
  if (notFound(r)) return { name, status: 'not_found' }
  return { name, status: 'failed', error: errMsg(r) }
}

function errMsg({ status, json }) {
  const errs = (json?.errors || []).map((e) => `[${e.code}] ${e.message}`).join('; ')
  return errs || `HTTP ${status}`
}

function log(kind, r) {
  const tag = r.status === 'deleted' ? 'deleted'
    : r.status === 'not_found' ? 'not found (skipping)'
    : `FAILED: ${r.error}`
  console.log(`  ${kind} ${r.name}: ${tag}`)
}

console.log(`Destroying Cloudflare infrastructure for prefix: ${prefix}`)
console.log(`Account: ${account}`)

console.log('\n— Workers —')
for (const name of WORKERS) {
  const r = await deleteWorker(name)
  results.workers.push(r)
  log('worker', r)
}

console.log('\n— Pages projects —')
for (const name of PAGES) {
  const r = await deletePages(name)
  results.pages.push(r)
  log('pages', r)
}

console.log('\n— D1 databases —')
for (const name of D1S) {
  const r = await deleteD1(name)
  results.d1.push(r)
  log('d1', r)
}

const all = [...results.workers, ...results.pages, ...results.d1]
const failed = all.filter((r) => r.status === 'failed')
const deleted = all.filter((r) => r.status === 'deleted').length
const skipped = all.filter((r) => r.status === 'not_found').length

console.log(`\nSummary: deleted=${deleted}, not_found=${skipped}, failed=${failed.length}`)

if (summaryFile) {
  const row = (r, kind) => `| ${kind} | \`${r.name}\` | ${r.status === 'failed' ? `failed — ${r.error}` : r.status} |`
  const lines = [
    `## Destroy summary — prefix \`${prefix}\``,
    '',
    `Deleted: **${deleted}**  ·  Not found: **${skipped}**  ·  Failed: **${failed.length}**`,
    '',
    '| Kind | Name | Result |',
    '|---|---|---|',
    ...results.workers.map((r) => row(r, 'worker')),
    ...results.pages.map((r) => row(r, 'pages')),
    ...results.d1.map((r) => row(r, 'd1')),
    '',
  ]
  appendFileSync(summaryFile, lines.join('\n') + '\n')
}

if (failed.length > 0) {
  console.error(`::error::${failed.length} resource(s) failed to delete`)
  process.exit(1)
}
