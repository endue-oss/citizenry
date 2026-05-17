<script lang="ts">
  import '$lib/styles/main.scss'
  import Sidebar from '$lib/components/Sidebar.svelte'

  let { children } = $props()
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
