<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte'
  import { onMount } from 'svelte'
  import { adminApi, AdminApiError } from '$lib/api'
  import { session } from '$lib/session'

  type Me = {
    admin_id: string
    issued_at: string
    expires_at: string
    jti: string
  }

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

  const fmt = (iso: string) => new Date(iso).toLocaleString()

  const placeholders = [
    { label: 'Humans', value: '—', hint: '/v1/admin/humans (wired — see /humans page)' },
    { label: 'Agents', value: '—', hint: '/v1/admin/agents (wired — see /agents page)' },
    { label: 'Vault entries', value: '—', hint: '/v1/admin/vault/entries (stub)' },
  ]
</script>

<Topbar title="Dashboard" />

<main class="page">
  <section class="hero">
    <img class="logo" src="/logo.svg" alt="Citizenry — an Endue product" width="80" height="80" />
    <div class="brand">
      <h2 class="wordmark">Citizenry</h2>
      <p class="by-endue">by <span class="endue-mark">Endue AI</span></p>
    </div>
    <a
      class="help"
      href="https://github.com/endue-oss/citizenry"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View on GitHub"
      title="View on GitHub"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.49.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.35 1.24-3.18-.12-.3-.54-1.51.12-3.15 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.85.12 3.15.77.83 1.24 1.89 1.24 3.18 0 4.54-2.81 5.54-5.49 5.83.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .31.21.68.83.56A12.01 12.01 0 0 0 24 12.29C24 5.78 18.63.5 12 .5z" />
      </svg>
      <span>View on GitHub</span>
    </a>
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
        <li><span>Admin id</span><code>{me.admin_id}</code></li>
        <li><span>Issued</span><code>{fmt(me.issued_at)}</code></li>
        <li><span>Expires</span><code>{fmt(me.expires_at)}</code></li>
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

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: $space-3;
    padding: $space-8 $space-4 $space-4;
  }
  .hero .logo {
    display: block;
    width: 80px;
    height: 80px;
    // Endue's light — a soft aura that gently breathes.
    filter: drop-shadow(0 0 22px color-mix(in oklch, var(--primary) 55%, transparent));
    animation: aura 5s ease-in-out infinite;
  }
  @keyframes aura {
    0%, 100% { filter: drop-shadow(0 0 16px color-mix(in oklch, var(--primary) 40%, transparent)); }
    50%      { filter: drop-shadow(0 0 30px color-mix(in oklch, var(--primary) 70%, transparent)); }
  }
  .hero .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-1;
  }
  .hero .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  // The product name is imbued with Endue's iridescent light. End colors
  // match so the drifting gradient loops seamlessly (no snap at cycle end).
  .hero .wordmark {
    font-size: $font-size-3xl;
    font-weight: $font-weight-semibold;
    letter-spacing: $letter-spacing-tight;
    line-height: 1.1;
    background: linear-gradient(
      100deg,
      #a78bfa,
      #818cf8,
      #e9d5ff,
      #f0abfc,
      #a78bfa
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: imbue 9s linear infinite;
  }
  @keyframes imbue {
    to { background-position: -200% center; }
  }
  // Restrained attribution beneath the imbued wordmark.
  .hero .by-endue {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    letter-spacing: 0.01em;

    .endue-mark {
      color: var(--foreground);
      font-weight: $font-weight-medium;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero .logo,
    .hero .wordmark { animation: none; }
  }
  .hero .help {
    display: inline-flex;
    align-items: center;
    gap: $space-2;
    margin-top: $space-1;
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-full;
    text-decoration: none;
    transition: color $transition-fast, border-color $transition-fast,
      background $transition-fast;

    &:hover {
      color: var(--foreground);
      border-color: var(--ring);
      background: var(--accent);
    }
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
