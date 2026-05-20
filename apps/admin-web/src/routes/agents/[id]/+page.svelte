<script lang="ts">
  // Agent detail — mirrors the Human detail layout: avatar hero +
  // numeric stats strip + profile fields + owner panel.
  //
  // The current admin agent surface (/v1/admin/agents/:id) does not
  // include the agent's signing-key set or DID — those land in a
  // follow-up admin endpoint. For now the page focuses on the row
  // shape that already exists.

  import { onMount } from 'svelte'
  import { page } from '$app/stores'
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
    status: string
    created_at: string
    updated_at: string
  }

  const agentId = $derived($page.params.id)

  let loading = $state(true)
  let err = $state<string | null>(null)
  let agent = $state<Agent | null>(null)
  let owner = $state<Human | null>(null)
  let copied = $state(false)

  onMount(async () => {
    try {
      agent = await adminApi.call<Agent>(`/v1/admin/agents/${agentId}`)
      try {
        owner = await adminApi.call<Human>(
          `/v1/admin/humans/${agent.owner_human_principal_id}`,
        )
      } catch {
        // Owner lookup is best-effort — render the principal id only
        // if the row is gone.
      }
    } catch (e) {
      err = e instanceof AdminApiError ? e.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

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
    if (!agent) return
    try {
      await navigator.clipboard.writeText(agent.id)
      copied = true
      setTimeout(() => (copied = false), 1200)
    } catch {
      // best-effort
    }
  }
</script>

<Topbar title={agent?.slug ?? 'Agent'} />

<main class="page">
  <nav class="crumbs">
    <a href="/agents">Agents</a>
    <span class="sep">/</span>
    <span class="here">{agent?.slug ?? agentId}</span>
  </nav>

  {#if err}
    <p class="error">{err}</p>
  {:else if loading}
    <p class="muted">Loading…</p>
  {:else if !agent}
    <p class="error">Agent not found.</p>
  {:else}
    <!-- ── Hero ───────────────────────────────────────────── -->
    <section class="hero">
      <div class="avatar">{initial(agent.display_name ?? agent.slug)}</div>
      <div class="hero-text">
        <h1>{agent.slug}</h1>
        <p class="sub">
          {agent.display_name ?? '—'}
          <span class="dot-sep" aria-hidden="true">·</span>
          registered {relTime(agent.created_at)}
        </p>
      </div>
      <div class="hero-meta">
        <StatusBadge
          tone={agentStatusTone(agent.status)}
          dot={agent.status === 'active'}
        >
          {agent.status}
        </StatusBadge>
      </div>
    </section>

    <!-- ── Quick stats ─────────────────────────────────────── -->
    <section class="stats">
      <article class="stat">
        <span class="stat-label">Owner</span>
        <strong class="stat-owner">
          {#if owner}
            {owner.email}
          {:else}
            <code class="dim">{agent.owner_human_principal_id}</code>
          {/if}
        </strong>
        <span class="stat-foot">
          {owner ? (owner.display_name ?? '—') : 'owner row missing'}
        </span>
      </article>
      <article class="stat">
        <span class="stat-label">Status</span>
        <strong class="status-strong" data-tone={agentStatusTone(agent.status)}>
          {agent.status}
        </strong>
        <span class="stat-foot">
          {agent.status === 'active' ? 'can sign requests' : 'cannot sign'}
        </span>
      </article>
      <article class="stat">
        <span class="stat-label">Registered</span>
        <strong>{relTime(agent.created_at)}</strong>
        <span class="stat-foot">{new Date(agent.created_at).toLocaleDateString()}</span>
      </article>
      <article class="stat">
        <span class="stat-label">Last update</span>
        <strong>{relTime(agent.updated_at)}</strong>
        <span class="stat-foot">{new Date(agent.updated_at).toLocaleDateString()}</span>
      </article>
    </section>

    <!-- ── Profile ─────────────────────────────────────────── -->
    <section class="card">
      <header>
        <h2>Profile</h2>
      </header>

      <div class="fields">
        <div class="field">
          <span class="field-label">Slug</span>
          <span class="field-value mono">{agent.slug}</span>
        </div>
        <div class="field">
          <span class="field-label">Display name</span>
          <span class="field-value">{agent.display_name ?? '—'}</span>
        </div>
        <div class="field">
          <span class="field-label">Status</span>
          <span class="field-value">
            <StatusBadge
              tone={agentStatusTone(agent.status)}
              dot={agent.status === 'active'}
            >
              {agent.status}
            </StatusBadge>
          </span>
        </div>
        <div class="field">
          <span class="field-label">Owner</span>
          <span class="field-value">
            {#if owner}
              <a href={`/humans/${owner.id}`} class="link-row">
                {owner.email}
              </a>
            {:else}
              <code class="dim">{agent.owner_human_principal_id}</code>
            {/if}
          </span>
        </div>
        <div class="field full">
          <span class="field-label">Principal id</span>
          <span class="field-value mono with-action">
            <code>{agent.id}</code>
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
            {new Date(agent.created_at).toLocaleString()}
            <span class="muted small">({relTime(agent.created_at)})</span>
          </span>
        </div>
        <div class="field">
          <span class="field-label">Last updated</span>
          <span class="field-value">
            {new Date(agent.updated_at).toLocaleString()}
            <span class="muted small">({relTime(agent.updated_at)})</span>
          </span>
        </div>
      </div>
    </section>

    <!-- ── Owner human ─────────────────────────────────────── -->
    <section class="card">
      <header>
        <h2>Owner human</h2>
        {#if owner}
          <a class="goto-link" href={`/humans/${owner.id}`}>Open profile →</a>
        {/if}
      </header>

      {#if !owner}
        <p class="empty">
          Owner row could not be loaded. The agent references
          <code>{agent.owner_human_principal_id}</code>.
        </p>
      {:else}
        <div class="fields">
          <div class="field">
            <span class="field-label">Email</span>
            <span class="field-value mono">{owner.email}</span>
          </div>
          <div class="field">
            <span class="field-label">Display name</span>
            <span class="field-value">{owner.display_name ?? '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Status</span>
            <span class="field-value">
              <StatusBadge
                tone={owner.status === 'active' ? 'success' : 'muted'}
                dot={owner.status === 'active'}
              >
                {owner.status.replace('_', ' ')}
              </StatusBadge>
            </span>
          </div>
          <div class="field">
            <span class="field-label">Joined</span>
            <span class="field-value">
              {new Date(owner.created_at).toLocaleDateString()}
              <span class="muted small">({relTime(owner.created_at)})</span>
            </span>
          </div>
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
      font-family: $font-mono;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.stat-owner {
        font-size: $font-size-base;
      }
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

      &.dim { color: var(--muted-foreground); }
    }
  }

  .link-row {
    color: var(--primary);
    text-decoration: none;
    font-weight: $font-weight-medium;

    &:hover { text-decoration: underline; }
  }

  .goto-link {
    color: var(--primary);
    font-size: $font-size-xs;
    text-decoration: none;
    font-weight: $font-weight-medium;

    &:hover { text-decoration: underline; }
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
