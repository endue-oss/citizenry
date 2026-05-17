<script lang="ts">
  import Topbar from '$lib/components/Topbar.svelte'

  const stats = [
    { label: 'Citizens', value: '—', delta: 'no data', tone: 'muted' as const },
    { label: 'Active sessions', value: '—', delta: 'no data', tone: 'muted' as const },
    { label: 'Vault secrets', value: '—', delta: 'no data', tone: 'muted' as const },
    { label: 'API requests (24h)', value: '—', delta: 'no data', tone: 'muted' as const },
  ]
</script>

<Topbar title="Dashboard" />

<main class="page">
  <section class="hero">
    <div>
      <h2>Welcome back</h2>
      <p>Operate the Citizenry control plane — identity, vault, and gateway health at a glance.</p>
    </div>
    <button class="cta" type="button">New invitation</button>
  </section>

  <section class="stats">
    {#each stats as s}
      <article class="card">
        <div class="card-label">{s.label}</div>
        <div class="card-value">{s.value}</div>
        <div class="card-delta">{s.delta}</div>
      </article>
    {/each}
  </section>

  <section class="grid">
    <article class="card panel">
      <header>
        <h3>Recent activity</h3>
        <span class="pill">live</span>
      </header>
      <div class="empty">
        <p>No activity yet. Connect <code>@citizenry/admin-api</code> to start streaming events.</p>
      </div>
    </article>

    <article class="card panel">
      <header>
        <h3>System</h3>
      </header>
      <ul class="kv">
        <li><span>Environment</span><code>local</code></li>
        <li><span>API</span><code>http://localhost:8788</code></li>
        <li><span>Spec</span><code>@citizenry/spec</code></li>
        <li><span>Build</span><code>dev</code></li>
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
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-4;

    h2 {
      font-size: $font-size-2xl;
      font-weight: $font-weight-semibold;
      margin-bottom: $space-1;
    }

    p {
      color: var(--muted-foreground);
      font-size: $font-size-sm;
      max-width: 56ch;
    }
  }

  .cta {
    background: var(--primary);
    color: var(--primary-foreground);
    padding: $space-2 $space-4;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    border-radius: $radius-md;
    transition: filter $transition-fast;

    &:hover { filter: brightness(1.08); }
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
    background: var(--success);
    color: var(--success-foreground);
    font-weight: $font-weight-medium;
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
      padding: 1px 6px;
      border-radius: $radius-sm;
      font-size: $font-size-xs;
    }
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
