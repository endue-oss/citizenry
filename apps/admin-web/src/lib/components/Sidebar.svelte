<script lang="ts">
  // Icon-rail sidebar — modelled on endue-ai/web's LeftSidebar (64px,
  // icon-only, tooltip on hover, sign-out pinned to the bottom). Labels
  // surface as a fixed-position tooltip rendered next to the hovered
  // button.

  import { page } from '$app/stores'
  import { goto } from '$app/navigation'
  import { adminApi } from '$lib/api'
  import { session } from '$lib/session'
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
      // Agents — bot face: antenna + rectangular frame + two dot eyes.
      // Non-anthropomorphic silhouette signals "AI principal" while
      // matching the stroke-2 line style of the rest of the rail.
      href: '/agents',
      label: 'Agents',
      icon:
        'M12 7V4 ' +
        'M11 4h2 ' +
        'M19 17H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2z ' +
        'M2 13h2 ' +
        'M20 13h2 ' +
        'M9 12.5v1 ' +
        'M15 12.5v1',
    },
    {
      href: '/enrollments',
      label: 'Enrollments',
      icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    },
    {
      href: '/vault',
      label: 'Vault',
      icon: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
    },
    {
      href: '/config',
      label: 'Config',
      icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.66 15 1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.66 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.66 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.66a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.55.23 1 .68 1.22 1.22H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z',
    },
  ]

  function isActive(href: string, pathname: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  // Tooltip state — single instance, positioned next to the hovered item.
  let tooltip = $state<{ top: number; label: string } | null>(null)

  function showTip(label: string) {
    return (event: FocusEvent | MouseEvent) => {
      const target = event.currentTarget as HTMLElement
      const rect = target.getBoundingClientRect()
      tooltip = { top: rect.top + rect.height / 2, label }
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
    <img src="/logo.svg" alt="" width="28" height="28" />
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
  <div class="tooltip" style:top="{tooltip.top}px">{tooltip.label}</div>
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
  }
</style>
