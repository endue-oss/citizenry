// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'

// SSG-only. Pure static output → Cloudflare Pages deploy unchanged.
// `site` is the canonical origin used for the sitemap and absolute/canonical
// URLs. The production instance serves this handbook from the apex
// citizenry.id (bound as a Pages custom domain — see
// docs/deploy-citizenry-id.md). Forks that stay on *.pages.dev can override
// this, but a mismatched `site` only affects sitemap/canonical metadata, not
// routing.
export default defineConfig({
  site: 'https://citizenry.id',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Citizenry',
      description: 'Endue Citizenry — handbook, RFCs, and API reference.',
      lastUpdated: true,
      pagination: true,
      logo: {
        src: './src/assets/citizenry-light.svg',
        alt: 'Endue Citizenry',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      // Pull Inter + JetBrains Mono — the same web fonts citizenry.id
      // loads in its index.html. handbook.css's --sans / --mono token
      // stacks declare these, but without the actual font files the
      // citizenry.id-style Header.scss renders against the system mono
      // fallback (which has a different baseline) and the nav-pill's
      // hover background drifts off-center.
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap',
          },
        },
      ],
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
        { label: 'Deploy citizenry.id', link: '/handbook/deploy-citizenry-id/' },
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
