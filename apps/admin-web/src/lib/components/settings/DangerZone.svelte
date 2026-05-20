<script lang="ts">
  // Red-bordered card for destructive controls. Render at the bottom
  // of a settings page so reversible options come first.

  import type { Snippet } from 'svelte'

  type Props = {
    title?: string
    description?: string
    children?: Snippet
  }

  let {
    title = 'Danger zone',
    description = 'These actions are irreversible. Proceed with care.',
    children,
  }: Props = $props()
</script>

<section class="danger">
  <header>
    <h3>{title}</h3>
    <p>{description}</p>
  </header>
  <div class="items">
    {@render children?.()}
  </div>
</section>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .danger {
    border: 1px solid color-mix(in oklch, var(--destructive) 48%, transparent);
    border-radius: $radius-lg;
    overflow: hidden;
  }

  header {
    padding: $space-3 $space-4;
    background: color-mix(in oklch, var(--destructive) 10%, transparent);
    border-bottom: 1px solid
      color-mix(in oklch, var(--destructive) 32%, transparent);

    h3 {
      font-size: $font-size-base;
      font-weight: $font-weight-semibold;
      color: var(--destructive);
    }
    p {
      margin-top: 2px;
      font-size: $font-size-xs;
      color: var(--muted-foreground);
    }
  }

  .items {
    display: flex;
    flex-direction: column;

    :global(> *) {
      padding: $space-4;
      border-bottom: 1px solid var(--border);

      &:last-child {
        border-bottom: none;
      }
    }
  }
</style>
