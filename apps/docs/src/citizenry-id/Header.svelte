<script lang="ts">
  import './Header.scss'
  import CtaDuo from './CtaDuo.svelte'
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { path } from './router.svelte'
  import { PRODUCTS } from './products'

  type Props = { onEnroll: () => void }
  let { onEnroll }: Props = $props()

  // Sub-nav (product context bar) appears only on /identity, /mail, /vault.
  // The active product is highlighted; the other two work as fast-switch tabs.
  const currentProductSlug = $derived(
    PRODUCTS.find((p) => `/${p.slug}` === path.value)?.slug ?? null
  )

  let scrolled = $state(false)
  let open = $state<string | null>(null)
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  // +1 = next-tab-to-the-right, -1 = previous-tab-to-the-left.
  // Drives the horizontal slide direction of the panel contents.
  let direction = $state(1)
  let lastOpenId: string | null = null
  // Bound to the clip wrapper's clientWidth — used to compute the slide
  // distance dynamically (at least half the panel width).
  let clipWidth = $state(0)
  const slideDistance = $derived(Math.max(clipWidth * 0.5, 64))

  type IconName =
    | 'identity' | 'mail' | 'vault'
    | 'claude' | 'codex' | 'gemini'
    | 'docs' | 'tenants'
  type Tone = 'identity' | 'mail' | 'vault' | undefined
  type MenuItem = { icon: IconName; label: string; desc: string; href: string; tone?: Tone }
  type Menu = { id: string; label: string; items: MenuItem[] }

  // Full SVG markup keyed by icon name. Each icon may pick its own viewBox so
  // we can reuse existing icons from elsewhere in the site (e.g. Modules).
  // All rendered at 16×16; currentColor is applied from the parent.
  const ICONS: Record<IconName, string> = {
    identity: `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5 2.5 4v4c0 3 2.4 5.7 5.5 6.5 3.1-.8 5.5-3.5 5.5-6.5V4L8 1.5Z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="m5.5 8 2 2 3.5-3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mail: `<svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="3.5" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="m2.5 4.5 5.5 4 5.5-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    // Same shield-with-keyhole SVG used by the Vault tab in Modules.
    vault: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3.2v5.3c0 4.6-3.3 8.6-8 9.5-4.7-.9-8-4.9-8-9.5V6.2L12 3z"/><circle cx="12" cy="11.5" r="1.7"/><path d="M12 13.2v2.6"/></svg>`,
    claude: `<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1.5" y="3" width="13" height="10" rx="1" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="m4 6.5 2 1.5-2 1.5M7.5 10.5h3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    codex: `<svg viewBox="0 0 16 16" width="16" height="16"><path d="m6 4-2 8M3.5 5.5 1.5 8l2 2.5M12.5 5.5 14.5 8l-2 2.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    gemini: `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.5c.5 3 2.5 5 5.5 5.5-3 .5-5 2.5-5.5 5.5-.5-3-2.5-5-5.5-5.5 3-.5 5-2.5 5.5-5.5Z" fill="currentColor"/></svg>`,
    docs: `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3.5 2h6l3 3v9.5h-9V2Z" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linejoin="round"/><path d="M9.5 2v3h3M5.5 8.5h5M5.5 11h5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
    tenants: `<svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="5.5" width="4.5" height="8.5" stroke="currentColor" stroke-width="1.4" fill="none"/><rect x="8.5" y="2" width="5.5" height="12" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M10.5 5h1.5M10.5 7.5h1.5M10.5 10h1.5M3.5 8.5h1.5M3.5 11h1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  }

  const menus: Menu[] = [
    {
      id: 'features',
      label: 'Features',
      items: [
        { icon: 'identity', label: 'Identity', desc: 'Verified agent ID & sign-in', href: '/identity', tone: 'identity' },
        { icon: 'mail',     label: 'Mail',     desc: 'Programmable mail for agents', href: '/mail',     tone: 'mail' },
        { icon: 'vault',    label: 'Vault',    desc: 'Secrets & credentials at the edge', href: '/vault', tone: 'vault' },
      ],
    },
    {
      id: 'use-cases',
      label: 'Use Cases',
      items: [
        { icon: 'claude', label: 'Claude Code', desc: 'Issue identity to Claude Code', href: '#' },
        { icon: 'codex',  label: 'Codex',       desc: 'Issue identity to OpenAI Codex', href: '#' },
        { icon: 'gemini', label: 'Gemini',      desc: 'Issue identity to Google Gemini', href: '#' },
      ],
    },
    {
      id: 'resources',
      label: 'Resources',
      items: [
        { icon: 'docs',    label: 'Docs',    desc: 'Guides, API reference, recipes', href: 'https://docs.citizenry.id' },
        { icon: 'tenants', label: 'Tenants', desc: 'Multi-tenant org & policy',      href: '#' },
      ],
    },
  ]

  function openMenu(id: string) {
    if (closeTimer) clearTimeout(closeTimer)
    if (lastOpenId && lastOpenId !== id) {
      const oldIdx = menus.findIndex((m) => m.id === lastOpenId)
      const newIdx = menus.findIndex((m) => m.id === id)
      if (oldIdx !== -1 && newIdx !== -1) {
        direction = newIdx > oldIdx ? 1 : -1
      }
    }
    lastOpenId = id
    open = id
  }
  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer)
    closeTimer = setTimeout(() => (open = null), 120)
  }
  function toggleMenu(id: string) {
    open = open === id ? null : id
  }

  // Active menu's items, used by the single shared panel.
  const currentItems = $derived(
    open ? menus.find((m) => m.id === open)?.items ?? [] : []
  )

  $effect(() => {
    const onScroll = () => (scrolled = window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = null
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKey)
    }
  })

  // Live fork count from GitHub's public REST API. Unauthenticated calls are
  // rate-limited per-IP (~60/hr) but that's plenty for a marketing site —
  // each visitor fetches once on mount. Failures are silent: the button
  // still renders, just without the count badge.
  let forks = $state<number | null>(null)
  $effect(() => {
    fetch('https://api.github.com/repos/endue-oss/citizenry')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.forks_count === 'number') forks = j.forks_count
      })
      .catch(() => {})
  })

  function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }
</script>

<header class="site-header" class:scrolled>
  <div class="inner">
    <a href="/" class="brand">
      <img class="logo" src="/endue-logo-dark.svg" alt="" aria-hidden="true" />
      <span class="wordmark">
        <span class="word">Endue</span><span class="tld">&nbsp;Citizenry</span>
      </span>
    </a>

    <div class="nav-center">
    <div class="nav-pill" aria-label="Primary">
      {#each menus as m (m.id)}
        <div
          class="nav-item"
          class:is-open={open === m.id}
          onmouseenter={() => openMenu(m.id)}
          onmouseleave={scheduleClose}
          role="presentation"
        >
          <button
            class="nav-link"
            type="button"
            aria-haspopup="true"
            aria-expanded={open === m.id}
            onclick={() => toggleMenu(m.id)}
          >
            {m.label}
            <svg class="nav-chev" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      {/each}

      {#if open}
        <div
          class="nav-panel"
          role="menu"
          onmouseenter={() => open && openMenu(open)}
          onmouseleave={scheduleClose}
        >
          <div class="nav-panel__clip" bind:clientWidth={clipWidth}>
            {#key open}
              <div
                class="nav-panel__items"
                in:fly|local={{ x: slideDistance * direction, duration: 320, easing: cubicOut }}
              >
                {#each currentItems as it (it.label)}
                  <a
                    class="nav-panel__item"
                    role="menuitem"
                    href={it.href}
                    data-tone={it.tone ?? ''}
                  >
                    <span class="nav-panel__icon" aria-hidden="true">
                      {@html ICONS[it.icon]}
                    </span>
                    <span class="nav-panel__text">
                      <span class="nav-panel__title">{it.label}</span>
                      <span class="nav-panel__desc">{it.desc}</span>
                    </span>
                  </a>
                {/each}
              </div>
            {/key}
          </div>
        </div>
      {/if}
    </div>

    <a
      class="gh-fork"
      href="https://github.com/endue-oss/citizenry/fork"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fork endue-oss/citizenry on GitHub"
    >
      <svg
        class="gh-fork__icon"
        viewBox="0 0 17 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M8.5 2.22168C5.23312 2.22168 2.58496 4.87398 2.58496 8.14677C2.58496 10.7642 4.27962 12.9853 6.63026 13.7684C6.92601 13.8228 7.03366 13.6401 7.03366 13.4827C7.03366 13.3425 7.02893 12.9693 7.02597 12.4754C5.38041 12.8333 5.0332 11.681 5.0332 11.681C4.76465 10.996 4.37663 10.8139 4.37663 10.8139C3.83954 10.4471 4.41744 10.4542 4.41744 10.4542C5.01072 10.4956 5.32303 11.0647 5.32303 11.0647C5.85065 11.9697 6.70774 11.7082 7.04431 11.5568C7.09873 11.1741 7.25134 10.9132 7.42051 10.7654C6.10737 10.6157 4.72621 10.107 4.72621 7.83683C4.72621 7.19031 4.95689 6.66092 5.33486 6.24686C5.27394 6.09721 5.07105 5.49447 5.39283 4.67938C5.39283 4.67938 5.88969 4.51967 7.01947 5.28626C7.502 5.15466 7.99985 5.08763 8.5 5.08692C9.00278 5.08929 9.50851 5.15495 9.98113 5.28626C11.1103 4.51967 11.606 4.67879 11.606 4.67879C11.9289 5.49447 11.7255 6.09721 11.6651 6.24686C12.0437 6.66092 12.2732 7.19031 12.2732 7.83683C12.2732 10.1129 10.8897 10.6139 9.5724 10.7606C9.78475 10.9434 9.97344 11.3048 9.97344 11.8579C9.97344 12.6493 9.96634 13.2887 9.96634 13.4827C9.96634 13.6413 10.0728 13.8258 10.3733 13.7678C11.5512 13.3728 12.5751 12.6175 13.3003 11.6089C14.0256 10.6002 14.4155 9.38912 14.415 8.14677C14.415 4.87398 11.7663 2.22168 8.5 2.22168Z"
          fill="currentColor"
        />
      </svg>
      <span class="gh-fork__label">Fork</span>
      {#if forks != null}
        <span class="gh-fork__count" aria-label={`${forks} forks`}>
          {formatCount(forks)}
        </span>
      {/if}
    </a>
    </div>

    <nav class="header-cta" aria-hidden={!scrolled}>
      <CtaDuo size="sm" short />
    </nav>
  </div>

  {#if currentProductSlug}
    <div class="product-subnav" aria-label="Product context">
      <div class="product-subnav__inner">
        {#each PRODUCTS as p (p.slug)}
          <a
            class="product-subnav__tab"
            class:is-active={currentProductSlug === p.slug}
            href={`/${p.slug}`}
            data-tone={p.tone}
          >
            <span class="product-subnav__icon" aria-hidden="true">
              {@html ICONS[p.id]}
            </span>
            {p.name}
          </a>
        {/each}
      </div>
    </div>
  {/if}
</header>
