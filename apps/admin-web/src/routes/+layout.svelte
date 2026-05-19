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

<div class="shell">
  <Sidebar />
  <div class="main">
    {@render children?.()}
  </div>
</div>

<style lang="scss">
  .shell {
    display: flex;
    min-height: 100dvh;
    background: var(--background);
    color: var(--foreground);
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
</style>
