<script lang="ts">
  // Slim top bar — modelled on endue-ai/web's MainTopBar (48px content
  // strip). The avatar / sign-out and theme toggle moved into the
  // sidebar's footer; everything chrome-like now lives on the rail.

  let { title = 'Dashboard' }: { title?: string } = $props()
</script>

<header class="topbar">
  <h1 class="title">{title}</h1>
</header>

<style lang="scss">
  @use '../styles/variables' as *;

  .topbar {
    flex-shrink: 0;
    height: 48px;
    display: flex;
    align-items: center;
    padding: 0 $space-6;
    background: var(--background);
    transition: background-color $transition-theme;
    position: sticky;
    top: 0;
    z-index: calc(#{$z-modal} - 3);
  }

  .title {
    font-size: $font-size-base;
    font-weight: $font-weight-semibold;
    color: var(--foreground);
    letter-spacing: $letter-spacing-tight;
  }
</style>
