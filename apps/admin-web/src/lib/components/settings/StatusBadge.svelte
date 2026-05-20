<script lang="ts">
  // Uniform pill for set/unset/active/error states. One stop for all
  // settings-page status indicators so a future tweak is one file.

  import type { Snippet } from 'svelte'

  type Tone = 'success' | 'muted' | 'info' | 'warning' | 'destructive'

  type Props = {
    tone?: Tone
    /** Optional dot prefix (small filled circle) for stronger "live" feel. */
    dot?: boolean
    children?: Snippet
  }

  let { tone = 'muted', dot = false, children }: Props = $props()
</script>

<span class="badge" data-tone={tone}>
  {#if dot}<span class="dot" aria-hidden="true"></span>{/if}
  <span class="label">{@render children?.()}</span>
</span>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 10px;
    border-radius: $radius-full;
    font-size: 11px;
    font-weight: $font-weight-medium;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    line-height: 1;
    border: 1px solid transparent;
    white-space: nowrap;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  [data-tone='success'] {
    background: color-mix(in oklch, var(--success) 22%, transparent);
    color: var(--success);
    border-color: color-mix(in oklch, var(--success) 36%, transparent);
  }
  [data-tone='info'] {
    background: color-mix(in oklch, var(--info) 22%, transparent);
    color: var(--info);
    border-color: color-mix(in oklch, var(--info) 36%, transparent);
  }
  [data-tone='warning'] {
    background: color-mix(in oklch, var(--warning) 22%, transparent);
    color: var(--warning);
    border-color: color-mix(in oklch, var(--warning) 36%, transparent);
  }
  [data-tone='destructive'] {
    background: color-mix(in oklch, var(--destructive) 22%, transparent);
    color: var(--destructive);
    border-color: color-mix(in oklch, var(--destructive) 36%, transparent);
  }
  [data-tone='muted'] {
    background: var(--muted);
    color: var(--muted-foreground);
    border-color: var(--border);
  }
</style>
