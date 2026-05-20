<script lang="ts">
  import '$lib/styles/main.scss'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { onMount } from 'svelte'
  import { adminApi, AdminApiError } from '$lib/api'
  import {
    clearSession,
    hasUsableSession,
    session,
  } from '$lib/session'

  let { children } = $props()

  // Boot state — true after we've decided whether the user is signed
  // in or not. While booting we hold the chrome and don't redirect, so
  // a stale access token can be refreshed silently before the user
  // sees a flash of the login page.
  let booted = $state(false)

  onMount(async () => {
    const path = $page.url.pathname
    if (path.startsWith('/login')) {
      booted = true
      return
    }

    // No tokens at all → straight to /login, no server round-trip.
    if (!hasUsableSession($session)) {
      booted = true
      void goto('/login', { replaceState: true })
      return
    }

    // Tokens present — verify with the server. `adminApi.me()` rides
    // through the same request wrapper as everything else, so a 401 on
    // an expired access token automatically triggers /auth/refresh and
    // retries once. If refresh fails the wrapper calls clearSession()
    // internally; we still call it here to be explicit.
    try {
      await adminApi.me()
      booted = true
    } catch (err) {
      if (err instanceof AdminApiError) {
        clearSession()
        booted = true
        void goto('/login', { replaceState: true })
        return
      }
      // Network blip etc. — don't sign the user out for a transient
      // failure; let them retry from the same page.
      booted = true
    }
  })

  // Reactive guard for navigation AFTER boot. Uses hasUsableSession so
  // an expired access token does not redirect — only a fully empty
  // session does. (The actual /auth/me / endpoint calls re-trigger the
  // 401 → refresh dance through api.ts when access has lapsed.)
  $effect(() => {
    if (!browser || !booted) return
    const path = $page.url.pathname
    if (path.startsWith('/login')) return
    if (!hasUsableSession($session)) {
      void goto('/login', { replaceState: true })
    }
  })
</script>

<div class="layout">
  <div class="left">
    <Sidebar />
  </div>
  <div class="main">
    {#if !booted}
      <div class="boot" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <span class="muted">Verifying session…</span>
      </div>
    {:else}
      {@render children?.()}
    {/if}
  </div>
</div>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  // 2-column grid mirroring endue-ai/web's AppLayout: a 64px rail
  // sticky on the left and a flexible main column on the right.
  .layout {
    display: grid;
    grid-template-columns: 64px 1fr;
    min-height: 100dvh;
    background: var(--background);
    color: var(--foreground);

    @include below(sm) {
      grid-template-columns: 1fr;
    }
  }

  .left {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    position: sticky;
    top: 0;
    z-index: $z-nav;

    @include below(sm) {
      display: none;
    }
  }

  .main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .boot {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: $space-3;
    color: var(--muted-foreground);
    font-size: $font-size-sm;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .muted { color: var(--muted-foreground); }
</style>
