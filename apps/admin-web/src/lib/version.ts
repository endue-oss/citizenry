// This build's version. Injected at build time by Vite (see
// vite.config.ts `define`), sourced from this app's package.json version
// — or overridden by the PUBLIC_APP_VERSION env so the deploy pipeline
// can stamp an explicit release version. Used to self-compare against
// the latest stable GitHub release (see $lib/whatsnew).
declare const __APP_VERSION__: string

export const APP_VERSION: string = __APP_VERSION__
