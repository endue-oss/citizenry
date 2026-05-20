<script lang="ts">
  // GitHub-style settings page header: breadcrumb-ish path + title +
  // optional supporting paragraph. Sits at the top of every settings
  // sub-page so the user always knows where they are.

  type Props = {
    path: string[]
    title: string
    description?: string
  }

  let { path, title, description }: Props = $props()
</script>

<header class="page-header">
  {#if path.length > 0}
    <nav class="crumbs" aria-label="Breadcrumb">
      {#each path as crumb, i}
        <span class="crumb">{crumb}</span>
        {#if i < path.length - 1}
          <span class="sep" aria-hidden="true">/</span>
        {/if}
      {/each}
    </nav>
  {/if}
  <h1>{title}</h1>
  {#if description}
    <p>{description}</p>
  {/if}
</header>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .page-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: $space-5;
    border-bottom: 1px solid var(--border);
    margin-bottom: $space-6;
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
    letter-spacing: 0.02em;
  }
  .crumb {
    text-transform: uppercase;
    font-weight: $font-weight-medium;
  }
  .sep {
    opacity: 0.5;
  }

  h1 {
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    letter-spacing: $letter-spacing-tight;
    color: var(--foreground);
  }

  p {
    margin-top: 4px;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    max-width: 64ch;
  }
</style>
