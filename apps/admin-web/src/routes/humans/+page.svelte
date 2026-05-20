<script lang="ts">
  // Humans list page. Fetches /v1/admin/humans (admin-api proxy →
  // api `/_admin/v1/admin/humans` → identity package adminIdentityRouter).

  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import Topbar from '$lib/components/Topbar.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  type Human = {
    id: string
    email: string
    display_name: string | null
    status: string
    created_at: string
    updated_at: string
  }

  type ListResp = {
    items: Human[]
    meta: { total: number; page: number; limit: number; has_next_page: boolean }
  }

  let loading = $state(true)
  let err = $state<string | null>(null)
  let resp = $state<ListResp | null>(null)
  let filter = $state('')

  onMount(async () => {
    try {
      resp = await adminApi.call<ListResp>('/v1/admin/humans?limit=200')
    } catch (e) {
      err = e instanceof AdminApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  const visible = $derived(
    resp
      ? filter.trim()
        ? resp.items.filter(
            (h) =>
              h.email.toLowerCase().includes(filter.trim().toLowerCase()) ||
              (h.display_name ?? '').toLowerCase().includes(filter.trim().toLowerCase()),
          )
        : resp.items
      : [],
  )

  const stats = $derived.by(() => {
    if (!resp) return null
    const active = resp.items.filter((h) => h.status === 'active').length
    const pending = resp.items.filter(
      (h) => h.status === 'pending_verification',
    ).length
    return { active, pending, total: resp.meta.total }
  })

  function statusTone(s: string) {
    if (s === 'active') return 'success' as const
    if (s === 'pending_verification') return 'warning' as const
    return 'muted' as const
  }
</script>

<Topbar title="Humans" />

<main class="page">
  <section class="hero">
    <div>
      <h2>Humans</h2>
      <p>
        Operator-side view of every <code>hu_</code> principal in
        <code>citizenry-identity-db</code>. Active humans can own agents and
        issue enrollments.
      </p>
    </div>
    {#if stats}
      <div class="stats">
        <span class="stat">
          <strong>{stats.active}</strong>
          <em>active</em>
        </span>
        <span class="stat">
          <strong>{stats.pending}</strong>
          <em>pending</em>
        </span>
        <span class="stat">
          <strong>{stats.total}</strong>
          <em>total</em>
        </span>
      </div>
    {/if}
  </section>

  <section class="toolbar">
    <input
      type="search"
      placeholder="Filter by email or name…"
      bind:value={filter}
      spellcheck="false"
    />
  </section>

  {#if err}
    <p class="error">{err}</p>
  {:else if loading}
    <p class="muted">Loading…</p>
  {:else if !resp || resp.items.length === 0}
    <p class="empty">
      No humans yet. Run
      <code>node scripts/dev/seed-humans-and-agents.mjs</code> for sample data.
    </p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Id</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as h}
            <tr
              class="row clickable"
              tabindex="0"
              role="link"
              aria-label="Open {h.email}"
              onclick={() => goto(`/humans/${h.id}`)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  goto(`/humans/${h.id}`)
                }
              }}
            >
              <td><code>{h.email}</code></td>
              <td>{h.display_name ?? '—'}</td>
              <td>
                <StatusBadge tone={statusTone(h.status)} dot={h.status === 'active'}>
                  {h.status.replace('_', ' ')}
                </StatusBadge>
              </td>
              <td><code class="dim">{h.id}</code></td>
              <td>{new Date(h.created_at).toLocaleString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</main>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .page {
    padding: $space-6;
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-4;
    flex-wrap: wrap;

    h2 {
      font-size: $font-size-2xl;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-tight;
    }
    p {
      margin-top: 4px;
      max-width: 64ch;
      font-size: $font-size-sm;
      color: var(--muted-foreground);

      code {
        background: var(--muted);
        padding: 1px 4px;
        border-radius: $radius-sm;
        font-family: $font-mono;
        font-size: $font-size-xs;
      }
    }
  }

  .stats {
    display: flex;
    gap: $space-4;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    strong {
      font-size: $font-size-2xl;
      font-weight: $font-weight-semibold;
      font-family: $font-mono;
    }
    em {
      font-style: normal;
      font-size: $font-size-xs;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted-foreground);
    }
  }

  .toolbar input {
    width: 100%;
    max-width: 360px;
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

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    background: var(--card);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: $font-size-sm;
  }

  th {
    text-align: left;
    padding: $space-3 $space-4;
    font-weight: $font-weight-semibold;
    font-size: $font-size-xs;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
    border-bottom: 1px solid var(--border);
  }

  td {
    padding: $space-3 $space-4;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;

    code {
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--foreground);

      &.dim { color: var(--muted-foreground); }
    }
  }

  tbody tr:last-child td { border-bottom: none; }
  tbody tr.clickable {
    cursor: pointer;

    &:hover { background: var(--accent); }
    &:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }
  }

  .error {
    padding: $space-3 $space-4;
    background: color-mix(in oklch, var(--destructive) 12%, transparent);
    border: 1px solid color-mix(in oklch, var(--destructive) 32%, transparent);
    border-radius: $radius-md;
    color: var(--destructive);
    font-size: $font-size-sm;
  }

  .muted {
    color: var(--muted-foreground);
    font-size: $font-size-sm;
  }

  .empty {
    padding: $space-8;
    border: 1px dashed var(--border);
    border-radius: $radius-md;
    text-align: center;
    color: var(--muted-foreground);
    font-size: $font-size-sm;

    code {
      background: var(--muted);
      padding: 1px 4px;
      border-radius: $radius-sm;
      font-family: $font-mono;
      font-size: $font-size-xs;
    }
  }
</style>
