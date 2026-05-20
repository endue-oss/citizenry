<script lang="ts">
  // Human detail — profile card + the agents this human owns.

  import { onMount } from 'svelte'
  import { page } from '$app/stores'
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

  type Agent = {
    id: string
    slug: string
    display_name: string | null
    status: string
    owner_human_principal_id: string
    created_at: string
    updated_at: string
  }

  type AgentResp = {
    items: Agent[]
    meta: { total: number; page: number; limit: number; has_next_page: boolean }
  }

  const humanId = $derived($page.params.id)

  let loading = $state(true)
  let err = $state<string | null>(null)
  let human = $state<Human | null>(null)
  let ownedAgents = $state<Agent[]>([])

  onMount(async () => {
    try {
      // Load the human in parallel with all agents (no owner-filter on
      // the backend yet — small N is fine to filter client-side).
      const [h, agentResp] = await Promise.all([
        adminApi.call<Human>(`/v1/admin/humans/${humanId}`),
        adminApi.call<AgentResp>('/v1/admin/agents?limit=200'),
      ])
      human = h
      ownedAgents = agentResp.items.filter(
        (a) => a.owner_human_principal_id === humanId,
      )
    } catch (e) {
      err = e instanceof AdminApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  function humanStatusTone(s: string) {
    if (s === 'active') return 'success' as const
    if (s === 'pending_verification') return 'warning' as const
    return 'muted' as const
  }
  function agentStatusTone(s: string) {
    if (s === 'active') return 'success' as const
    if (s === 'revoked') return 'destructive' as const
    return 'muted' as const
  }
</script>

<Topbar title={human?.email ?? 'Human'} />

<main class="page">
  <nav class="crumbs">
    <a href="/humans">Humans</a>
    <span class="sep">/</span>
    <span class="here">{human?.email ?? humanId}</span>
  </nav>

  {#if err}
    <p class="error">{err}</p>
  {:else if loading}
    <p class="muted">Loading…</p>
  {:else if !human}
    <p class="error">Human not found.</p>
  {:else}
    <section class="hero">
      <div class="hero-main">
        <h1>{human.email}</h1>
        <p class="muted">
          {human.display_name ?? '—'} · <code class="dim">{human.id}</code>
        </p>
      </div>
      <div class="hero-side">
        <StatusBadge
          tone={humanStatusTone(human.status)}
          dot={human.status === 'active'}
        >
          {human.status.replace('_', ' ')}
        </StatusBadge>
      </div>
    </section>

    <article class="card">
      <header><h3>Profile</h3></header>
      <ul class="kv">
        <li><span>Email</span><code>{human.email}</code></li>
        <li><span>Display name</span>{human.display_name ?? '—'}</li>
        <li>
          <span>Status</span>
          <StatusBadge
            tone={humanStatusTone(human.status)}
            dot={human.status === 'active'}
          >
            {human.status.replace('_', ' ')}
          </StatusBadge>
        </li>
        <li><span>Principal id</span><code class="dim">{human.id}</code></li>
        <li><span>Created</span>{new Date(human.created_at).toLocaleString()}</li>
        <li><span>Updated</span>{new Date(human.updated_at).toLocaleString()}</li>
      </ul>
    </article>

    <article class="card">
      <header>
        <h3>Owned agents</h3>
        <StatusBadge tone={ownedAgents.length ? 'info' : 'muted'}>
          {ownedAgents.length} {ownedAgents.length === 1 ? 'agent' : 'agents'}
        </StatusBadge>
      </header>

      {#if ownedAgents.length === 0}
        <p class="empty">
          No agents registered under this human yet. Agents inherit the
          owner relationship when registered with this human's API key.
        </p>
      {:else}
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Display name</th>
                <th>Status</th>
                <th>Id</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {#each ownedAgents as a}
                <tr>
                  <td><code>{a.slug}</code></td>
                  <td>{a.display_name ?? '—'}</td>
                  <td>
                    <StatusBadge
                      tone={agentStatusTone(a.status)}
                      dot={a.status === 'active'}
                    >
                      {a.status}
                    </StatusBadge>
                  </td>
                  <td><code class="dim">{a.id}</code></td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </article>
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

  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $font-size-xs;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);

    a {
      color: var(--muted-foreground);
      text-decoration: none;
      font-weight: $font-weight-medium;
      &:hover { color: var(--foreground); }
    }
    .sep { opacity: 0.5; }
    .here { color: var(--foreground); }
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-4;
    flex-wrap: wrap;
    padding-bottom: $space-4;
    border-bottom: 1px solid var(--border);

    h1 {
      font-size: $font-size-2xl;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-tight;
    }
  }

  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    padding: $space-4;
    display: flex;
    flex-direction: column;
    gap: $space-3;

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;

      h3 {
        font-size: $font-size-base;
        font-weight: $font-weight-semibold;
      }
    }
  }

  .kv {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 160px 1fr;

    li {
      display: contents;

      span {
        padding: 8px $space-3 8px 0;
        color: var(--muted-foreground);
        font-size: $font-size-sm;
        border-bottom: 1px solid var(--border);
      }
      :global(:where(:not(span):not(:first-child))) {
        padding: 8px 0;
        border-bottom: 1px solid var(--border);
        font-size: $font-size-sm;
      }

      &:last-child span,
      &:last-child :global(:not(span):last-child) { border-bottom: none; }
    }

    code {
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--foreground);

      &.dim { color: var(--muted-foreground); }
    }
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: $radius-md;
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
    code {
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--foreground);
      &.dim { color: var(--muted-foreground); }
    }
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--accent); }

  .empty {
    padding: $space-6;
    border: 1px dashed var(--border);
    border-radius: $radius-md;
    text-align: center;
    color: var(--muted-foreground);
    font-size: $font-size-sm;
  }

  .error {
    padding: $space-3 $space-4;
    background: color-mix(in oklch, var(--destructive) 12%, transparent);
    border: 1px solid color-mix(in oklch, var(--destructive) 32%, transparent);
    border-radius: $radius-md;
    color: var(--destructive);
    font-size: $font-size-sm;
  }
  .muted { color: var(--muted-foreground); font-size: $font-size-sm; }
</style>
