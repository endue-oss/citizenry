<script lang="ts">
  import ThemeToggle from './ThemeToggle.svelte'
  import { adminApi } from '$lib/api'
  import { goto } from '$app/navigation'
  import { session } from '$lib/session'

  let { title = 'Dashboard' }: { title?: string } = $props()

  let menuOpen = $state(false)

  const adminId = $derived($session?.claims.sub ?? null)
  const initial = $derived((adminId ?? 'A').trim().charAt(0).toUpperCase() || 'A')

  async function logout() {
    menuOpen = false
    await adminApi.logout()
    await goto('/login', { replaceState: true })
  }
</script>

<header class="topbar">
  <div class="left">
    <h1 class="title">{title}</h1>
  </div>
  <div class="right">
    <div class="search">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input type="search" placeholder="Search…" aria-label="Search" />
    </div>
    <ThemeToggle />
    <div class="account">
      <button
        type="button"
        class="avatar"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={adminId ? `Admin: ${adminId}` : 'Admin menu'}
        onclick={() => (menuOpen = !menuOpen)}
      >
        {initial}
      </button>
      {#if menuOpen}
        <div class="menu" role="menu">
          <div class="menu-id" title={adminId ?? ''}>{adminId ?? '—'}</div>
          <button class="menu-item" role="menuitem" onclick={logout}>Sign out</button>
        </div>
      {/if}
    </div>
  </div>
</header>

<style lang="scss">
  @use '../styles/variables' as *;

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-4;
    height: $header-height;
    padding: 0 $space-6;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    position: sticky;
    top: 0;
    z-index: $z-nav;
  }

  .title {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: var(--foreground);
  }

  .right {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  .search {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: 0 $space-3;
    height: 32px;
    width: 220px;
    background: var(--muted);
    border-radius: $radius-md;
    color: var(--muted-foreground);

    input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: $font-size-sm;
      color: var(--foreground);
      font-family: inherit;

      &::placeholder { color: var(--muted-foreground); }
    }
  }

  .account {
    position: relative;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: $radius-full;
    background: var(--primary);
    color: var(--primary-foreground);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    border: none;
    cursor: pointer;
    transition: filter $transition-fast;

    &:hover {
      filter: brightness(1.08);
    }
  }

  .menu {
    position: absolute;
    top: calc(100% + #{$space-2});
    right: 0;
    min-width: 200px;
    padding: $space-2;
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-md;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: $z-modal;
  }

  .menu-id {
    padding: $space-2 $space-3;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-item {
    width: 100%;
    text-align: left;
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    color: var(--foreground);
    background: transparent;
    border: none;
    border-radius: $radius-sm;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:hover {
      background: var(--muted);
    }
  }
</style>
