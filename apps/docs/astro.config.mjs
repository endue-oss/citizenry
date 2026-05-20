// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'

// SSG-only. Pure static output → Cloudflare Pages deploy unchanged.
export default defineConfig({
  site: 'https://citizenry-docs.pages.dev',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Citizenry',
      description: 'Endue Citizenry — handbook, RFCs, and API reference.',
      lastUpdated: true,
      pagination: true,
      logo: {
        src: './src/assets/endue-logo-dark.svg',
        alt: 'Endue Citizenry',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      // Brand is dark-only (matches citizenry.id). Hide the theme picker.
      // The Header slot is replaced wholesale with the citizenry.id
      // marketing-site header so the handbook + main site share one
      // chrome — Search is replaced too because the citizenry.id
      // header doesn't carry one.
      components: {
        Header: './src/components/StarlightHeader.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/endue-oss/citizenry' },
      ],
      // Source RFC/ADR markdown lives in <repo>/docs/. sync-content.mjs
      // copies it into src/content/docs/handbook/ before Astro builds.
      sidebar: [
        { label: 'Welcome', link: '/' },
        { label: 'Deploy', link: '/handbook/deploy/' },
        {
          label: 'ADRs',
          collapsed: false,
          items: [{ autogenerate: { directory: 'handbook/adr' } }],
        },
        {
          label: 'RFCs',
          collapsed: false,
          items: [{ autogenerate: { directory: 'handbook/rfcs' } }],
        },
        {
          label: 'Error codes',
          collapsed: true,
          items: [{ autogenerate: { directory: 'handbook/error-codes' } }],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Identity', link: '/api/identity/' },
            { label: 'Vault', link: '/api/vault/' },
            { label: 'Mail', link: '/api/mail/' },
          ],
        },
      ],
      // Keep the Starlight chrome trim — no edit-on-GitHub link by
      // default (RFCs/ADRs flow through PRs, not direct edits).
      customCss: ['./src/styles/handbook.css'],
    }),
    sitemap(),
    svelte(),
  ],
})
