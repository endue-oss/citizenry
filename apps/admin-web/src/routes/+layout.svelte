<script lang="ts">
  import '$lib/styles/main.scss'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { isAuthenticated, session } from '$lib/session'

  let { children } = $props()

  // Route guard. /login has its own layout (no Sidebar), so it never
  // reaches this component — but if SvelteKit ever invokes this layout
  // for the login route in the future, the early-return below prevents
  // a redirect loop.
  $effect(() => {
    if (!browser) return
    const path = $page.url.pathname
    if (path.startsWith('/login')) return
    if (!isAuthenticated($session)) {
      goto('/login', { replaceState: true })
    }
  })
</script>

<div class="layout">
  <div class="left">
    <Sidebar />
  </div>
  <div class="main">
    {@render children?.()}
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
</style>
