<script lang="ts">
  // Auth-only shell: no sidebar, no top-bar. Matches the centered-card
  // layout from endue-ai/web's AuthLayout.
  import '$lib/styles/main.scss'

  let { children } = $props()
</script>

<div class="wrapper">
  {@render children?.()}
</div>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: $space-4;
    background: var(--background);
    color: var(--foreground);
  }
</style>
