<script lang="ts">
  // GitHub-style settings section: a bordered card with a 2-column
  // layout — title + supporting copy on the left, controls on the
  // right. On narrow screens it collapses to a single column.

  import type { Snippet } from 'svelte'

  type Props = {
    title: string
    description?: string
    /** Optional eyebrow label, e.g. "Required" / "Optional". */
    eyebrow?: string
    /** Optional inline badge in the title row (e.g. a Status pill). */
    status?: Snippet
    /** Optional footnote / help link rendered under the body. */
    footer?: Snippet
    /** Single-column layout (description above body). Useful for tables. */
    stacked?: boolean
    children?: Snippet
  }

  let {
    title,
    description,
    eyebrow,
    status,
    footer,
    stacked = false,
    children,
  }: Props = $props()
</script>

<article class="card" class:stacked>
  <header>
    {#if eyebrow}
      <span class="eyebrow">{eyebrow}</span>
    {/if}
    <div class="title-row">
      <h3>{title}</h3>
      {#if status}
        <div class="status-slot">{@render status()}</div>
      {/if}
    </div>
    {#if description}
      <p class="description">{description}</p>
    {/if}
  </header>

  <div class="body">
    {@render children?.()}
  </div>

  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</article>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .card {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(0, 2fr);
    gap: $space-6;
    padding: $space-5;
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-lg;

    @include below(md) {
      grid-template-columns: 1fr;
      gap: $space-3;
    }

    &.stacked {
      grid-template-columns: 1fr;
    }
  }

  header {
    display: flex;
    flex-direction: column;
    gap: $space-2;

    .card.stacked & {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: $space-2;
    }
  }

  .eyebrow {
    font-size: $font-size-xs;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    font-weight: $font-weight-medium;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: $space-3;
    flex-wrap: wrap;

    h3 {
      font-size: $font-size-base;
      font-weight: $font-weight-semibold;
      color: var(--foreground);
      letter-spacing: $letter-spacing-tight;
    }
  }

  .description {
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    line-height: $line-height-normal;
    max-width: 42ch;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }

  footer {
    grid-column: 1 / -1;
    margin-top: $space-3;
    padding-top: $space-3;
    border-top: 1px solid var(--border);
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }
</style>
