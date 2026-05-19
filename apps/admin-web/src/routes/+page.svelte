<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte'
  import { onMount } from 'svelte'
  import { adminApi, AdminApiError } from '$lib/api'
  import { session } from '$lib/session'

  type Me = { sub: string; iat: number; exp: number }

  let me = $state<Me | null>(null)
  let error = $state<string | null>(null)
  let loading = $state(true)

  onMount(async () => {
    try {
      me = await adminApi.me()
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        // Layout guard will redirect; nothing to do here.
        return
      }
      error = err instanceof Error ? err.message : 'Failed to load /auth/me'
    } finally {
      loading = false
    }
  })

  const fmt = (sec: number) => new Date(sec * 1000).toLocaleString()

  const placeholders = [
    { label: 'Humans', value: '—', hint: '/v1/admin/humans (not yet wired)' },
    { label: 'Agents', value: '—', hint: '/v1/admin/agents (stub)' },
    { label: 'Enrollments', value: '—', hint: '/v1/admin/enrollments (stub)' },
    { label: 'Vault entries', value: '—', hint: '/v1/admin/vault/entries (stub)' },
  ]
</script>

<Topbar title="Dashboard" />

<main class="page">
  <section class="hero">
    <div>
      <h2>Welcome back</h2>
      <p>Operate the Citizenry control plane — identity, mail, vault, and gateway health at a glance.</p>
    </div>
  </section>

  <section class="card panel session">
    <header>
      <h3>Session</h3>
      <span class="pill" class:pill-ok={!!me} class:pill-warn={!!error}>
        {loading ? 'loading' : error ? 'error' : 'live'}
      </span>
    </header>
    {#if loading}
      <p class="muted">Verifying admin session…</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if me}
      <ul class="kv">
        <li><span>Admin id</span><code>{me.sub}</code></li>
        <li><span>Issued</span><code>{fmt(me.iat)}</code></li>
        <li><span>Expires</span><code>{fmt(me.exp)}</code></li>
        <li><span>Refresh</span><code>{$session ? 'rotating on use' : '—'}</code></li>
      </ul>
    {/if}
  </section>

  <section class="stats">
    {#each placeholders as s}
      <article class="card">
        <div class="card-label">{s.label}</div>
        <div class="card-value">{s.value}</div>
        <div class="card-delta">{s.hint}</div>
      </article>
    {/each}
  </section>

  <section class="grid">
    <article class="card panel">
      <header>
        <h3>Recent activity</h3>
      </header>
      <div class="empty">
        <p>No activity yet. Wire an admin endpoint that streams audit events.</p>
      </div>
    </article>

    <article class="card panel">
      <header>
        <h3>System</h3>
      </header>
      <ul class="kv">
        <li><span>admin-api</span><code>connected</code></li>
        <li><span>Spec</span><code>@citizenry/spec</code></li>
      </ul>
    </article>
  </section>
</main>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .page {
    padding: $space-6;
    display: flex;
    flex-direction: column;
    gap: $space-6;
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
    max-width: 56ch;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: $space-4;

    @include below(lg) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    @include below(sm) { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    padding: $space-4;
  }

  .card-label {
    font-size: $font-size-xs;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-value {
    font-size: $font-size-3xl;
    font-weight: $font-weight-semibold;
    margin-top: $space-2;
    font-family: $font-mono;
  }

  .card-delta {
    margin-top: $space-1;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }

  .grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: $space-4;

    @include below(lg) { grid-template-columns: 1fr; }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: $space-4;

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

  .pill {
    font-size: $font-size-xs;
    padding: 2px 8px;
    border-radius: $radius-full;
    background: var(--muted);
    color: var(--muted-foreground);
    font-weight: $font-weight-medium;
  }
  .pill-ok {
    background: var(--success);
    color: var(--success-foreground);
  }
  .pill-warn {
    background: var(--destructive);
    color: var(--destructive-foreground);
  }

  .session ul.kv li code {
    font-family: $font-mono;
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
  .error {
    padding: $space-2 $space-3;
    color: var(--destructive-foreground);
    background: var(--destructive);
    border-radius: $radius-md;
    font-size: $font-size-sm;
  }

  .kv {
    display: flex;
    flex-direction: column;

    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: $space-2 0;
      border-bottom: 1px solid var(--border);
      font-size: $font-size-sm;

      &:last-child { border-bottom: none; }

      span { color: var(--muted-foreground); }
      code { font-family: $font-mono; font-size: $font-size-xs; color: var(--foreground); }
    }
  }
</style>
