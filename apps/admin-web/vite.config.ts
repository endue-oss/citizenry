import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Single source of truth for "this build's version": the app's
// package.json `version`, overridable by the PUBLIC_APP_VERSION env so
// the deploy pipeline can stamp an explicit release version. Baked into
// the bundle at build time and read via $lib/version.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string }
const APP_VERSION = process.env.PUBLIC_APP_VERSION || pkg.version

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    host: '0.0.0.0',
    port: 3001,
  },
})
