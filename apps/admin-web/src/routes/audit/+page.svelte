<script lang="ts">
  // Audit log page. Fetches /v1/admin/audit-log (admin-api proxy →
  // api `/_admin/v1/admin/audit-log` → identity adminIdentityRouter),
  // which reads the append-only identity `audit_log` table.

  import { onMount } from 'svelte'
  import Topbar from '$lib/components/Topbar.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  type Entry = {
    id: string
    actor: string | null
    action: string
    target: string | null
    outcome: 'success' | 'failure'
    payload: unknown
    created_at: string
  }
  type ListResp = {
    items: Entry[]
    meta: { total: number; page: number; limit: number; has_next_page: boolean }
  }

  const LIMIT = 50

  let loading = $state(true)
  let err = $state<string | null>(null)
  let resp = $state<ListResp | null>(null)
  let page = $state(1)

  // Exact-match server-side filters.
  let actor = $state('')
  let action = $state('')

  async function load() {
    loading = true
    err = null
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (actor.trim()) qs.set('actor', actor.trim())
      if (action.trim()) qs.set('action', action.trim())
      resp = await adminApi.call<ListResp>(`/v1/admin/audit-log?${qs}`)
    } catch (e) {
      err = e instanceof AdminApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  }

  onMount(load)

  function applyFilters() {
    page = 1
    void load()
  }
  function go(delta: number) {
    page = Math.max(1, page + delta)
    void load()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString()
  const tone = (o: string) => (o === 'success' ? ('success' as const) : ('destructive' as const))
</script>

<Topbar title="Audit log" />

<main class="page">
  <section class="hero">
    <h2>Audit log</h2>
    <p>
      Every state-changing admin action, newest first — recorded in the
      append-only <code>audit_log</code> table. Reads are not audited; secret
      values are never stored.
    </p>
  </section>

  <form class="filters" onsubmit={(e) => { e.preventDefault(); applyFilters() }}>
    <input placeholder="Filter by actor (e.g. admin)" bind:value={actor} />
    <input placeholder="Filter by action (e.g. config.set)" bind:value={action} />
    <button type="submit" class="btn">Apply</button>
    {#if actor || action}
      <button
        type="button"
        class="btn ghost"
        onclick={() => { actor = ''; action = ''; applyFilters() }}
      >Clear</button>
    {/if}
  </form>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if err}
    <p class="error">{err}</p>
  {:else if resp && resp.items.length > 0}
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {#each resp.items as e (e.id)}
            <tr>
              <td class="mono nowrap">{fmt(e.created_at)}</td>
              <td class="mono">{e.actor ?? '—'}</td>
              <td><code>{e.action}</code></td>
              <td class="mono">{e.target ?? '—'}</td>
              <td><StatusBadge tone={tone(e.outcome)} dot>{e.outcome}</StatusBadge></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="pager">
      <span class="muted small">
        {resp.meta.total} total · page {resp.meta.page}
      </span>
      <span class="spacer"></span>
      <button class="btn ghost" disabled={page <= 1} onclick={() => go(-1)}>Prev</button>
      <button class="btn ghost" disabled={!resp.meta.has_next_page} onclick={() => go(1)}>Next</button>
    </div>
  {:else}
    <div class="empty">
      <p>No audit entries{actor || action ? ' match the filters' : ' yet'}.</p>
    </div>
  {/if}
</main>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .page {
    padding: $space-6;
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }
  .hero h2 {
    font-size: $font-size-2xl;
    font-weight: $font-weight-semibold;
    margin-bottom: $space-1;
    letter-spacing: $letter-spacing-tight;
  }
  .hero p {
    color: var(--muted-foreground);
    font-size: $font-size-sm;
    max-width: 70ch;
    code {
      background: var(--muted);
      padding: 1px 4px;
      border-radius: $radius-sm;
      font-family: $font-mono;
      font-size: $font-size-xs;
    }
  }

  .filters {
    display: flex;
    gap: $space-2;
    flex-wrap: wrap;

    input {
      flex: 1;
      min-width: 200px;
      padding: $space-2 $space-3;
      font-size: $font-size-sm;
      color: var(--foreground);
      background: var(--background);
      border: 1px solid var(--input);
      border-radius: $radius-md;
      &:focus {
        outline: none;
        border-color: var(--ring);
        box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 18%, transparent);
      }
    }
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: $font-size-sm;
  }
  thead th {
    text-align: left;
    padding: $space-3 $space-4;
    font-size: $font-size-xs;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
  }
  tbody td {
    padding: $space-3 $space-4;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--accent); }
  .mono { font-family: $font-mono; font-size: $font-size-xs; }
  .nowrap { white-space: nowrap; }
  code {
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: var(--foreground);
  }

  .pager {
    display: flex;
    align-items: center;
    gap: $space-3;
    .spacer { flex: 1; }
  }

  .btn {
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    border-radius: $radius-md;
    border: 1px solid transparent;
    cursor: pointer;
    background: var(--primary);
    color: var(--primary-foreground);
    &:hover:not(:disabled) { filter: brightness(1.08); }
    &.ghost {
      background: transparent;
      color: var(--foreground);
      border-color: var(--border);
      &:hover:not(:disabled) { background: var(--accent); }
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .empty {
    padding: $space-8;
    border: 1px dashed var(--border);
    border-radius: $radius-md;
    text-align: center;
    color: var(--muted-foreground);
    font-size: $font-size-sm;
  }
  .muted { color: var(--muted-foreground); font-size: $font-size-sm; }
  .small { font-size: $font-size-xs; }
  .error {
    padding: $space-2 $space-3;
    color: var(--destructive-foreground);
    background: var(--destructive);
    border-radius: $radius-md;
    font-size: $font-size-sm;
  }
</style>
