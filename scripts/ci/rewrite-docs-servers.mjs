#!/usr/bin/env node
// Rewrite the Production server URL inside the OpenAPI YAMLs that ship
// with the Scalar docs site, so Scalar's "Try it" hits the actual
// deployed Workers for this fork.
//
// Expects:
//   SERVICE_PREFIX      e.g. "citizenry"
//   WORKERS_SUBDOMAIN   e.g. "alice-1234"  (resolved by deploy.yml)
//   DOCS_DIST           path to apps/docs/dist (defaults relative to repo)
//
// Identity and Vault live on the `${P}-api` Worker; Mail lives on the
// `${P}-mail` Worker. We rewrite only the `servers:` block at the end
// of each file so descriptions / examples that mention citizenry.id are
// left untouched.

import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const prefix = process.env.SERVICE_PREFIX || 'citizenry';
const subdomain = process.env.WORKERS_SUBDOMAIN;
if (!subdomain) {
  console.error('WORKERS_SUBDOMAIN is required');
  process.exit(1);
}

const dist = process.env.DOCS_DIST
  ? resolve(process.env.DOCS_DIST)
  : resolve(repoRoot, 'apps/docs/dist');

const apiUrl = `https://${prefix}-api.${subdomain}.workers.dev`;
const mailUrl = `https://${prefix}-mail.${subdomain}.workers.dev`;

const targets = [
  { file: 'identity-api.yaml', url: apiUrl },
  { file: 'vault-api.yaml', url: apiUrl },
  { file: 'mail-api.yaml', url: mailUrl },
];

for (const { file, url } of targets) {
  const path = resolve(dist, file);
  try {
    await access(path);
  } catch {
    console.error(`missing input: ${path}`);
    process.exit(1);
  }
  const src = await readFile(path, 'utf8');
  // Match the `servers:` block (anchored at start of line) through EOF
  // and rewrite only its `url: https://citizenry.id` entry.
  const rewritten = src.replace(/^servers:[\s\S]*$/m, (block) =>
    block.replace(/(^ {2}- url: )https:\/\/citizenry\.id$/m, `$1${url}`),
  );
  if (rewritten === src) {
    console.error(`no servers entry rewritten in ${file}`);
    process.exit(1);
  }
  await writeFile(path, rewritten);
  console.log(`rewrote  ${file}  ->  ${url}`);
}
