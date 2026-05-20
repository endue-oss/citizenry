<script lang="ts">
  // Human detail — avatar hero + stats strip + profile fields + owned
  // agents. Polished compared to the first cut: clearer hierarchy,
  // bigger value typography, copy-to-clipboard for the principal id,
  // and a numeric stats row near the top.

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
  let copied = $state(false)

  onMount(async () => {
    try {
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

  function initial(s: string | null) {
    if (!s) return '?'
    const trimmed = s.trim()
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
  }

  function relTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const sec = Math.max(0, Math.round(diffMs / 1000))
    if (sec < 60) return `${sec}s ago`
    const min = Math.round(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.round(min / 60)
    if (hr < 48) return `${hr}h ago`
    const day = Math.round(hr / 24)
    if (day < 60) return `${day}d ago`
    const mon = Math.round(day / 30)
    if (mon < 24) return `${mon}mo ago`
    return `${Math.round(mon / 12)}y ago`
  }

  async function copyId() {
    if (!human) return
    try {
      await navigator.clipboard.writeText(human.id)
      copied = true
      setTimeout(() => (copied = false), 1200)
    } catch {
      // best-effort; silently ignore on browsers that block writeText
    }
  }

  const activeAgents = $derived(
    ownedAgents.filter((a) => a.status === 'active').length,
  )
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
    <!-- ── Hero ───────────────────────────────────────────── -->
    <section class="hero">
      <div class="avatar">{initial(human.display_name ?? human.email)}</div>
      <div class="hero-text">
        <h1>{human.email}</h1>
        <p class="sub">
          {human.display_name ?? '—'}
          <span class="dot-sep" aria-hidden="true">·</span>
          joined {relTime(human.created_at)}
        </p>
      </div>
      <div class="hero-meta">
        <StatusBadge
          tone={humanStatusTone(human.status)}
          dot={human.status === 'active'}
        >
          {human.status.replace('_', ' ')}
        </StatusBadge>
      </div>
    </section>

    <!-- ── Quick stats ─────────────────────────────────────── -->
    <section class="stats">
      <article class="stat">
        <span class="stat-label">Owned agents</span>
        <strong>{ownedAgents.length}</strong>
        <span class="stat-foot">{activeAgents} active</span>
      </article>
      <article class="stat">
        <span class="stat-label">Status</span>
        <strong class="status-strong" data-tone={humanStatusTone(human.status)}>
          {human.status.replace('_', ' ')}
        </strong>
        <span class="stat-foot">
          {human.status === 'active' ? 'can own agents' : 'awaiting verification'}
        </span>
      </article>
      <article class="stat">
        <span class="stat-label">Joined</span>
        <strong>{relTime(human.created_at)}</strong>
        <span class="stat-foot">{new Date(human.created_at).toLocaleDateString()}</span>
      </article>
      <article class="stat">
        <span class="stat-label">Last update</span>
        <strong>{relTime(human.updated_at)}</strong>
        <span class="stat-foot">{new Date(human.updated_at).toLocaleDateString()}</span>
      </article>
    </section>

    <!-- ── Profile ─────────────────────────────────────────── -->
    <section class="card">
      <header>
        <h2>Profile</h2>
      </header>

      <div class="fields">
        <div class="field">
          <span class="field-label">Email</span>
          <span class="field-value mono">{human.email}</span>
        </div>
        <div class="field">
          <span class="field-label">Display name</span>
          <span class="field-value">{human.display_name ?? '—'}</span>
        </div>
        <div class="field">
          <span class="field-label">Status</span>
          <span class="field-value">
            <StatusBadge
              tone={humanStatusTone(human.status)}
              dot={human.status === 'active'}
            >
              {human.status.replace('_', ' ')}
            </StatusBadge>
          </span>
        </div>
        <div class="field full">
          <span class="field-label">Principal id</span>
          <span class="field-value mono with-action">
            <code>{human.id}</code>
            <button
              type="button"
              class="copy-btn"
              onclick={copyId}
              aria-label="Copy principal id"
            >
              {copied ? '✓ copied' : 'Copy'}
            </button>
          </span>
        </div>
        <div class="field">
          <span class="field-label">Created</span>
          <span class="field-value">
            {new Date(human.created_at).toLocaleString()}
            <span class="muted small">({relTime(human.created_at)})</span>
          </span>
        </div>
        <div class="field">
          <span class="field-label">Last updated</span>
          <span class="field-value">
            {new Date(human.updated_at).toLocaleString()}
            <span class="muted small">({relTime(human.updated_at)})</span>
          </span>
        </div>
      </div>
    </section>

    <!-- ── Owned agents ────────────────────────────────────── -->
    <section class="card">
      <header>
        <h2>Owned agents</h2>
        <StatusBadge tone={ownedAgents.length ? 'info' : 'muted'}>
          {ownedAgents.length} {ownedAgents.length === 1 ? 'agent' : 'agents'}
        </StatusBadge>
      </header>

      {#if ownedAgents.length === 0}
        <p class="empty">
          No agents registered under this human yet. Agents are created
          when this human's API key is used against
          <code>POST /v1/agent/register</code>.
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
                  <td><code class="mono">{a.slug}</code></td>
                  <td>{a.display_name ?? '—'}</td>
                  <td>
                    <StatusBadge
                      tone={agentStatusTone(a.status)}
                      dot={a.status === 'active'}
                    >
                      {a.status}
                    </StatusBadge>
                  </td>
                  <td><code class="mono dim">{a.id}</code></td>
                  <td>
                    <span title={new Date(a.created_at).toLocaleString()}>
                      {relTime(a.created_at)}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</main>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .page {
    padding: $space-6 $space-8;
    display: flex;
    flex-direction: column;
    gap: $space-5;
    max-width: 960px;
    margin: 0 auto;
    width: 100%;

    @include below(md) { padding: $space-5 $space-4; }
  }

  // ── breadcrumb ────────────────────────────────────────────
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

  // ── hero ──────────────────────────────────────────────────
  .hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: $space-4;
    padding: $space-4 0 $space-5;
    border-bottom: 1px solid var(--border);

    @include below(sm) {
      grid-template-columns: auto 1fr;
      grid-template-rows: auto auto;
    }
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--logo-tone-light), var(--logo-tone-dark));
    color: var(--primary-foreground);
    display: grid;
    place-items: center;
    font-size: 26px;
    font-weight: $font-weight-semibold;
    letter-spacing: -0.02em;
    flex-shrink: 0;
  }

  .hero-text {
    min-width: 0;

    h1 {
      font-size: $font-size-2xl;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-tight;
      line-height: 1.1;
      word-break: break-all;
    }
    .sub {
      margin-top: 6px;
      color: var(--muted-foreground);
      font-size: $font-size-sm;
    }
    .dot-sep {
      margin: 0 6px;
      opacity: 0.6;
    }
  }

  .hero-meta {
    @include below(sm) {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  // ── stats row ─────────────────────────────────────────────
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: $space-3;

    @include below(md) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @include below(sm) { grid-template-columns: 1fr; }
  }

  .stat {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: $radius-md;
    padding: $space-3 $space-4;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;

    .stat-label {
      font-size: 11px;
      font-weight: $font-weight-medium;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted-foreground);
    }
    strong {
      font-size: $font-size-xl;
      font-weight: $font-weight-semibold;
      font-family: $font-mono;
      letter-spacing: -0.01em;
      color: var(--foreground);

      &.status-strong {
        font-family: $font-primary;
        font-size: $font-size-base;
        text-transform: capitalize;

        &[data-tone='success']    { color: var(--success); }
        &[data-tone='warning']    { color: var(--warning); }
        &[data-tone='destructive']{ color: var(--destructive); }
      }
    }
    .stat-foot {
      font-size: $font-size-xs;
      color: var(--muted-foreground);
    }
  }

  // ── card ──────────────────────────────────────────────────
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    padding: $space-5;
    display: flex;
    flex-direction: column;
    gap: $space-4;

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: $space-3;

      h2 {
        font-size: $font-size-base;
        font-weight: $font-weight-semibold;
      }
    }
  }

  // ── profile fields ────────────────────────────────────────
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: $space-3 $space-6;

    @include below(sm) { grid-template-columns: 1fr; }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: $space-3;
    border-bottom: 1px solid var(--border);
    min-width: 0;

    &.full {
      grid-column: 1 / -1;
    }
  }

  .field-label {
    font-size: 11px;
    font-weight: $font-weight-medium;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .field-value {
    font-size: $font-size-sm;
    color: var(--foreground);
    word-break: break-word;

    &.mono { font-family: $font-mono; font-size: $font-size-sm; }

    &.with-action {
      display: flex;
      align-items: center;
      gap: $space-2;
      flex-wrap: wrap;
    }

    code {
      font-family: $font-mono;
      font-size: $font-size-sm;
      background: var(--muted);
      padding: 2px 6px;
      border-radius: $radius-sm;
    }
  }

  .copy-btn {
    padding: 2px 8px;
    font-size: 11px;
    font-weight: $font-weight-medium;
    font-family: $font-primary;
    color: var(--muted-foreground);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: $radius-sm;
    cursor: pointer;
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: var(--accent);
      color: var(--foreground);
    }
  }

  // ── agents table ─────────────────────────────────────────
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
    background: var(--background);
  }
  td {
    padding: $space-3 $space-4;
    border-bottom: 1px solid var(--border);

    code.mono {
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--foreground);
      &.dim { color: var(--muted-foreground); }
    }
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--accent); }

  // ── empty / error / muted ────────────────────────────────
  .empty {
    padding: $space-6;
    border: 1px dashed var(--border);
    border-radius: $radius-md;
    text-align: center;
    color: var(--muted-foreground);
    font-size: $font-size-sm;

    code {
      font-family: $font-mono;
      font-size: $font-size-xs;
      background: var(--muted);
      padding: 1px 6px;
      border-radius: $radius-sm;
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
  .muted { color: var(--muted-foreground); }
  .small { font-size: $font-size-xs; }
</style>
