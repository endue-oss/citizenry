#!/usr/bin/env node
// Build the static Scalar API reference site.
// Copies the TypeSpec-generated OpenAPI YAMLs, the Scalar standalone browser
// bundle, and the HTML shell into dist/. The result is a fully self-contained
// static site — no CDN, no server-side rendering, no edge functions.

import { access, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const dist = resolve(here, 'dist');

const inputs = [
  {
    from: resolve(repoRoot, 'packages/spec/generated/openapi/identity-api.yaml'),
    to: resolve(dist, 'identity-api.yaml'),
    hint: "run 'pnpm --filter @citizenry/spec run build' first",
  },
  {
    from: resolve(repoRoot, 'packages/spec/generated/openapi/vault-api.yaml'),
    to: resolve(dist, 'vault-api.yaml'),
    hint: "run 'pnpm --filter @citizenry/spec run build' first",
  },
  {
    from: resolve(repoRoot, 'packages/spec/generated/openapi/mail-api.yaml'),
    to: resolve(dist, 'mail-api.yaml'),
    hint: "run 'pnpm --filter @citizenry/spec run build' first",
  },
  {
    from: resolve(here, 'node_modules/@scalar/api-reference/dist/browser/standalone.js'),
    to: resolve(dist, 'scalar.standalone.js'),
    hint: "run 'pnpm install' first",
  },
  {
    from: resolve(here, 'static/index.html'),
    to: resolve(dist, 'index.html'),
  },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const { from, to, hint } of inputs) {
  try {
    await access(from);
  } catch {
    console.error(`missing input: ${relative(repoRoot, from)}`);
    if (hint) console.error(`hint: ${hint}`);
    process.exit(1);
  }
  await mkdir(dirname(to), { recursive: true });
  await cp(from, to);
  console.log(`copy  ${relative(repoRoot, from)}  ->  ${relative(repoRoot, to)}`);
}

console.log(`built  ${relative(repoRoot, dist)}`);
