<script lang="ts">
  // Agents list page. Same shape as Humans — hits /v1/admin/agents.

  import { onMount } from 'svelte'
  import Topbar from '$lib/components/Topbar.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  type Agent = {
    id: string
    slug: string
    display_name: string | null
    status: string
    owner_human_principal_id: string
    created_at: string
    updated_at: string
  }

  type Human = {
    id: string
    email: string
    display_name: string | null
  }

  type AgentResp = {
    items: Agent[]
    meta: { total: number; page: number; limit: number; has_next_page: boolean }
  }

  type HumanResp = {
    items: Human[]
    meta: { total: number; page: number; limit: number; has_next_page: boolean }
  }

  let loading = $state(true)
  let err = $state<string | null>(null)
  let resp = $state<AgentResp | null>(null)
  let humansById = $state<Map<string, Human>>(new Map())
  let filter = $state('')

  onMount(async () => {
    try {
      // Pull humans in parallel so the table can show owner email
      // instead of a raw hu_ULID.
      const [agentResp, humanResp] = await Promise.all([
        adminApi.call<AgentResp>('/v1/admin/agents?limit=200'),
        adminApi.call<HumanResp>('/v1/admin/humans?limit=200'),
      ])
      resp = agentResp
      humansById = new Map(humanResp.items.map((h) => [h.id, h]))
    } catch (e) {
      err = e instanceof AdminApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  const visible = $derived(
    resp
      ? filter.trim()
        ? resp.items.filter((a) => {
            const owner = humansById.get(a.owner_human_principal_id)
            const q = filter.trim().toLowerCase()
            return (
              a.slug.toLowerCase().includes(q) ||
              (a.display_name ?? '').toLowerCase().includes(q) ||
              (owner?.email ?? '').toLowerCase().includes(q)
            )
          })
        : resp.items
      : [],
  )

  const stats = $derived.by(() => {
    if (!resp) return null
    const active = resp.items.filter((a) => a.status === 'active').length
    const revoked = resp.items.filter((a) => a.status === 'revoked').length
    return { active, revoked, total: resp.meta.total }
  })

  function statusTone(s: string) {
    if (s === 'active') return 'success' as const
    if (s === 'revoked') return 'destructive' as const
    return 'muted' as const
  }
</script>

<Topbar title="Agents" />

<main class="page">
  <section class="hero">
    <div>
      <h2>Agents</h2>
      <p>
        Every <code>ag_</code> principal registered against this instance. Each
        agent is owned by a verified human and signs API calls with an Ed25519
        keypair.
      </p>
    </div>
    {#if stats}
      <div class="stats">
        <span class="stat">
          <strong>{stats.active}</strong>
          <em>active</em>
        </span>
        <span class="stat">
          <strong>{stats.revoked}</strong>
          <em>revoked</em>
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
      placeholder="Filter by slug, name, or owner email…"
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
      No agents yet. Run
      <code>node scripts/dev/seed-humans-and-agents.mjs</code> for sample data.
    </p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Display name</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Id</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as a}
            {@const owner = humansById.get(a.owner_human_principal_id)}
            <tr>
              <td><code>{a.slug}</code></td>
              <td>{a.display_name ?? '—'}</td>
              <td>
                {#if owner}
                  <code>{owner.email}</code>
                {:else}
                  <code class="dim">{a.owner_human_principal_id}</code>
                {/if}
              </td>
              <td>
                <StatusBadge
                  tone={statusTone(a.status)}
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
  tbody tr:hover { background: var(--accent); }

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
