<script lang="ts">
  // Icon-rail sidebar — modelled on endue-ai/web's LeftSidebar (64px,
  // icon-only, tooltip on hover, sign-out pinned to the bottom). Labels
  // surface as a fixed-position tooltip rendered next to the hovered
  // button.

  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { adminApi } from '$lib/api'
  import { session } from '$lib/session'
  import { checkForUpdate, type UpdateInfo } from '$lib/whatsnew'
  import ThemeToggle from './ThemeToggle.svelte'

  type NavItem = { href: string; label: string; icon: string }

  const items: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
    {
      // Humans — two-person silhouette. Two heads + overlapping
      // shoulders read as "multiple humans" at 20px and stay visibly
      // distinct from the rectangular Agents glyph next to it.
      href: '/humans',
      label: 'Humans',
      icon:
        'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 ' +
        'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 ' +
        'M16 3.13a4 4 0 0 1 0 7.75 ' +
        'M23 21v-2a4 4 0 0 0-3-3.87',
    },
    {
      // Agents — hexagonal node. Abstract identity-as-peer shape;
      // contrasts cleanly with the curvy Humans silhouette next to it
      // and stays readable at 20px. From Lucide's `hexagon`.
      href: '/agents',
      label: 'Agents',
      icon:
        'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    },
    {
      // Audit log — a document with lines (Lucide `file-text`), reading
      // as a record/ledger of admin actions.
      href: '/audit',
      label: 'Audit log',
      icon:
        'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z ' +
        'M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.66 15 1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.66 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.66 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.66a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.55.23 1 .68 1.22 1.22H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
    },
  ]

  function isActive(href: string, pathname: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // External links pinned to the bottom of the rail (above the footer).
  // `external: true` makes the hover tooltip carry an "opens externally"
  // glyph so operators know the link leaves the console.
  const externalLinks = [
    {
      href: 'https://citizenry-docs.pages.dev',
      label: 'Documentation',
      // Lucide `file-text` — reads as "docs" at 20px.
      icon:
        'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z ' +
        'M14 2v5h5 M16 13H8 M16 17H8 M10 9H8',
    },
  ]

  // GitHub's mark is a filled glyph (rendered separately from the
  // stroke-based icons above).
  const githubHref = 'https://github.com/endue-oss/citizenry'

  // "What's new" — shown only when a stable GitHub release newer than
  // this build exists. Resolved client-side after mount; stays null
  // (icon hidden) otherwise. See $lib/whatsnew.
  let update = $state<UpdateInfo | null>(null)
  onMount(() => {
    void checkForUpdate().then((u) => {
      update = u
    })
  })

  // Tooltip state — single instance, positioned next to the hovered item.
  let tooltip = $state<{ top: number; label: string; external: boolean } | null>(null)

  function showTip(label: string, external = false) {
    return (event: FocusEvent | MouseEvent) => {
      const target = event.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      tooltip = { top: rect.top + rect.height / 2, label, external }
    }
  }
  function hideTip() {
    tooltip = null
  }

  const adminId = $derived($session?.claims.sub ?? null)
  const initial = $derived((adminId ?? 'A').trim().charAt(0).toUpperCase() || 'A')

  async function logout() {
    await adminApi.logout()
    await goto('/login', { replaceState: true })
  }
</script>

<aside class="rail" aria-label="Primary navigation">
  <a class="logo" href="/" aria-label="Citizenry home">
    <img src="/citizenry-light.svg" alt="" width="28" height="28" />
  </a>

  <div class="divider"></div>

  <nav class="nav">
    {#each items as item}
      <a
        class="item"
        class:active={isActive(item.href, $page.url.pathname)}
        href={item.href}
        aria-label={item.label}
        onmouseenter={showTip(item.label)}
        onmouseleave={hideTip}
        onfocus={showTip(item.label)}
        onblur={hideTip}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={item.icon} />
        </svg>
      </a>
    {/each}
  </nav>

  <div class="links">
    {#each externalLinks as link}
      <a
        class="item"
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${link.label} (opens in a new tab)`}
        onmouseenter={showTip(link.label, true)}
        onmouseleave={hideTip}
        onfocus={showTip(link.label, true)}
        onblur={hideTip}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={link.icon} />
        </svg>
      </a>
    {/each}
    <a
      class="item"
      href={githubHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="GitHub (opens in a new tab)"
      onmouseenter={showTip('GitHub', true)}
      onmouseleave={hideTip}
      onfocus={showTip('GitHub', true)}
      onblur={hideTip}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.49.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.35 1.24-3.18-.12-.3-.54-1.51.12-3.15 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.85.12 3.15.77.83 1.24 1.89 1.24 3.18 0 4.54-2.81 5.54-5.49 5.83.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .31.21.68.83.56A12.01 12.01 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z" />
      </svg>
    </a>
    {#if update}
      <a
        class="item whatsnew"
        href={update.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`What's new in ${update.version} (opens in a new tab)`}
        onmouseenter={showTip(`What's new · ${update.version}`, true)}
        onmouseleave={hideTip}
        onfocus={showTip(`What's new · ${update.version}`, true)}
        onblur={hideTip}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <!-- Lucide `sparkles` — "what's new". -->
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275z" />
          <path d="M5 3v4" />
          <path d="M19 17v4" />
          <path d="M3 5h4" />
          <path d="M17 19h4" />
        </svg>
        <span class="badge" aria-hidden="true"></span>
      </a>
    {/if}
  </div>

  <div class="footer">
    <div class="divider"></div>
    <div
      class="item theme-slot"
      role="presentation"
      onmouseenter={showTip('Theme')}
      onmouseleave={hideTip}
    >
      <ThemeToggle />
    </div>
    <button
      class="item user"
      type="button"
      aria-label={adminId ? `Sign out (${adminId})` : 'Sign out'}
      onmouseenter={showTip(adminId ? `${adminId} · sign out` : 'Sign out')}
      onmouseleave={hideTip}
      onfocus={showTip(adminId ? `${adminId} · sign out` : 'Sign out')}
      onblur={hideTip}
      onclick={logout}
    >
      <span class="avatar">{initial}</span>
    </button>
  </div>
</aside>

{#if tooltip}
  <div class="tooltip" style:top="{tooltip.top}px">
    <span>{tooltip.label}</span>
    {#if tooltip.external}
      <!-- Lucide `external-link` — signals the link opens outside the console. -->
      <svg class="ext" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
      </svg>
    {/if}
  </div>
{/if}

<style lang="scss">
  @use '../styles/variables' as *;

  .rail {
    flex-shrink: 0;
    width: 64px;
    height: 100dvh;
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: $space-3 0;
    background: var(--background);
    border-right: 1px solid var(--border);
    z-index: $z-nav;
  }

  .logo {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    transition: opacity $transition-fast, background $transition-fast;

    &:hover {
      background: var(--accent);
      opacity: 0.92;
    }

    img {
      display: block;
      width: 28px;
      height: 28px;
    }
  }

  .divider {
    width: 66%;
    height: 1px;
    margin: 10px auto;
    background: var(--border);
  }

  .nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar { display: none; }
  }

  .item {
    appearance: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin: 0 auto;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--muted-foreground);
    text-decoration: none;
    cursor: pointer;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: var(--accent);
      color: var(--foreground);
    }

    &.active {
      background: var(--accent);
      color: var(--foreground);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--ring);
    }
  }

  // External links (Docs, GitHub) pinned just above the footer. The
  // `.nav` flex:1 above pushes this group to the bottom of the rail.
  .links {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    flex-shrink: 0;
  }

  // "What's new" nudge — tinted with the brand colour and badged with a
  // small dot so an available update reads as actionable, not just nav.
  .whatsnew {
    position: relative;
    color: var(--primary);

    &:hover {
      background: var(--accent);
      color: var(--primary);
    }

    .badge {
      position: absolute;
      top: 9px;
      right: 9px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--primary);
      box-shadow: 0 0 0 2px var(--background);
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .whatsnew .badge {
      animation: badge-pulse 2.4s ease-in-out infinite;
    }
  }
  @keyframes badge-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
  }

  .footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding-top: $space-2;
  }

  // Wrap ThemeToggle in the standard 48×48 slot so it lines up with
  // the rail icon grid; the component's own button stays untouched.
  .theme-slot {
    cursor: default;

    &:hover { background: var(--accent); }
  }

  .user {
    padding: 0;
  }

  .avatar {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--primary-foreground);
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
  }

  .tooltip {
    position: fixed;
    left: 72px;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    background: rgba(17, 24, 39, 0.95);
    color: #ffffff;
    font-size: 13px;
    font-weight: $font-weight-medium;
    white-space: nowrap;
    pointer-events: none;
    z-index: $z-modal;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);

    .ext {
      flex-shrink: 0;
      opacity: 0.8;
    }
  }
</style>
