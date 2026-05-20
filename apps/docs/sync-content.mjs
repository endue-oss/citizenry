#!/usr/bin/env node
// Pre-build sync for the Starlight docs site.
//
// Astro's content collections live under `src/content/docs/`, but the
// canonical markdown sources stay at `<repo>/docs/` so RFCs and ADRs
// remain browsable on GitHub and round-trip through the governance
// process unchanged. This script copies them into `src/content/docs/
// handbook/` at build time and normalises frontmatter so every page
// has a Starlight-friendly `title:`.
//
// Also copies the TypeSpec-generated OpenAPI YAMLs and the Scalar
// standalone browser bundle into `public/` so they ship inside the
// built `dist/` next to the rendered handbook pages.

import { access, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const srcDocs = resolve(repoRoot, 'docs')
const destHandbook = resolve(here, 'src/content/docs/handbook')
const publicDir = resolve(here, 'public')

const requireExists = async (path, hint) => {
  try {
    await access(path)
  } catch {
    console.error(`missing input: ${relative(repoRoot, path)}`)
    if (hint) console.error(`hint: ${hint}`)
    process.exit(1)
  }
}

// ── Markdown sync ─────────────────────────────────────────────────────

async function walkMarkdown(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkMarkdown(full)))
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      out.push(full)
    }
  }
  return out
}

function deriveTitle(body, fallback) {
  const m = body.match(/^#\s+(.+?)\s*$/m)
  if (m) return m[1].trim()
  return fallback
}

function ensureFrontmatter(content, fallbackTitle) {
  // No frontmatter — synthesize one.
  if (!content.startsWith('---\n')) {
    const title = deriveTitle(content, fallbackTitle)
    return `---\ntitle: ${JSON.stringify(title)}\n---\n\n${content}`
  }
  // Frontmatter exists — ensure `title:` is present.
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  const block = content.slice(4, end)
  const rest = content.slice(end + 4)
  if (/^title:\s*\S/m.test(block)) return content
  const title = deriveTitle(rest, fallbackTitle)
  return `---\n${block.trim()}\ntitle: ${JSON.stringify(title)}\n---${rest}`
}

await rm(destHandbook, { recursive: true, force: true })
await mkdir(destHandbook, { recursive: true })

const mdFiles = await walkMarkdown(srcDocs)
for (const path of mdFiles) {
  const rel = relative(srcDocs, path)
  const dest = resolve(destHandbook, rel)
  await mkdir(dirname(dest), { recursive: true })
  const raw = await readFile(path, 'utf8')
  const fallback = rel.replace(/\.md$/, '').replace(/\//g, ' / ')
  const fixed = ensureFrontmatter(raw, fallback)
  await writeFile(dest, fixed)
  console.log(`md     ${rel}`)
}

// ── OpenAPI YAML sync ─────────────────────────────────────────────────
//
// Files land at `public/<name>.yaml` so the production `dist/` keeps
// the same shape today's static build produced. scripts/ci/rewrite-docs-
// servers.mjs operates on those paths after build.

const openapi = [
  { name: 'identity-api.yaml' },
  { name: 'vault-api.yaml' },
  { name: 'mail-api.yaml' },
]

for (const { name } of openapi) {
  const from = resolve(repoRoot, 'packages/spec/generated/openapi', name)
  await requireExists(from, "run 'pnpm --filter @citizenry/spec run build' first")
  const to = resolve(publicDir, name)
  await mkdir(dirname(to), { recursive: true })
  await cp(from, to)
  console.log(`api    ${name}`)
}

// ── Scalar standalone bundle ──────────────────────────────────────────

const scalarBundle = resolve(
  here,
  'node_modules/@scalar/api-reference/dist/browser/standalone.js',
)
await requireExists(scalarBundle, "run 'pnpm install' first")
await cp(scalarBundle, resolve(publicDir, 'scalar.standalone.js'))
console.log('scalar standalone.js')

console.log(`synced into ${relative(repoRoot, here)}/{src/content/docs/handbook,public}`)
