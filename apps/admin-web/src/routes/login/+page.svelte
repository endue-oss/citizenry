<script lang="ts">
  import { goto } from '$app/navigation'
  import { adminApi, AdminApiError } from '$lib/api'
  import { isAuthenticated } from '$lib/session'
  import { onMount } from 'svelte'

  let adminId = $state('')
  let password = $state('')
  let submitting = $state(false)
  let error = $state<string | null>(null)

  onMount(() => {
    // Already signed in — skip the login form.
    if (isAuthenticated()) {
      goto('/', { replaceState: true })
    }
  })

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault()
    if (submitting) return
    error = null
    submitting = true
    try {
      await adminApi.login({ admin_id: adminId.trim(), password })
      await goto('/', { replaceState: true })
    } catch (err) {
      if (err instanceof AdminApiError) {
        error =
          err.status === 401
            ? 'Incorrect admin id or password.'
            : err.message || 'Sign-in failed.'
      } else {
        error = 'Sign-in failed. Check your network and try again.'
      }
    } finally {
      submitting = false
    }
  }
</script>

<svelte:head>
  <title>Sign in — Citizenry admin</title>
</svelte:head>

<section class="card" aria-labelledby="auth-title">
  <div class="brand">
    <img class="logo" src="/logo.svg" alt="" width="80" height="80" />
    <h1 id="auth-title" class="wordmark">Citizenry</h1>
    <p class="by-endue">by <span class="endue-mark">Endue AI</span></p>
    <p class="subtitle">for Admin</p>
  </div>

  <form class="form" onsubmit={onSubmit} aria-live="polite">
    <label class="field">
      <span class="label">Admin id</span>
      <input
        type="text"
        autocomplete="username"
        spellcheck="false"
        autocapitalize="off"
        required
        bind:value={adminId}
        disabled={submitting}
      />
    </label>

    <label class="field">
      <span class="label">Password</span>
      <input
        type="password"
        autocomplete="current-password"
        required
        bind:value={password}
        disabled={submitting}
      />
    </label>

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    <button type="submit" class="cta" disabled={submitting || !adminId || !password}>
      {submitting ? 'Signing in…' : 'Sign in'}
    </button>
  </form>

  <p class="hint">
    Retrieve the bootstrap admin password with
    <code>wrangler d1 execute citizenry-config-db --remote --command="SELECT * FROM config WHERE config_key='admin.password';"</code>.
  </p>
</section>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    max-width: 400px;
    padding: $space-10 $space-6;
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-lg;

    @include below(sm) {
      border: none;
      padding: $space-8 $space-4;
    }
  }

  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-2;
    margin-bottom: $space-8;
  }

  .logo {
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

  // The product name is imbued with Endue's iridescent light. End colors
  // match so the drifting gradient loops seamlessly (no snap at cycle end).
  .wordmark {
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
  .by-endue {
    margin: 0;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    letter-spacing: 0.01em;

    .endue-mark {
      color: var(--foreground);
      font-weight: $font-weight-medium;
    }
  }

  .subtitle {
    font-size: $font-size-sm;
    color: var(--muted-foreground);
  }

  @media (prefers-reduced-motion: reduce) {
    .logo,
    .wordmark { animation: none; }
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: $space-4;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }

  .label {
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted-foreground);
  }

  input {
    width: 100%;
    padding: $space-3 $space-4;
    font-size: $font-size-sm;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--input);
    border-radius: $radius-md;
    transition: border-color $transition-fast, box-shadow $transition-fast;

    &:focus {
      outline: none;
      border-color: var(--ring);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 18%, transparent);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .error {
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    color: var(--destructive-foreground);
    background: var(--destructive);
    border-radius: $radius-md;
  }

  .cta {
    margin-top: $space-2;
    padding: $space-3 $space-4;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: var(--primary-foreground);
    background: var(--primary);
    border: none;
    border-radius: $radius-md;
    cursor: pointer;
    transition: filter $transition-fast;

    &:hover:not(:disabled) {
      filter: brightness(1.08);
    }

    &:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  }

  .hint {
    margin-top: $space-6;
    font-size: $font-size-xs;
    line-height: $line-height-relaxed;
    color: var(--muted-foreground);

    code {
      display: inline-block;
      margin-top: $space-1;
      padding: 2px 6px;
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--foreground);
      background: var(--muted);
      border-radius: $radius-sm;
      word-break: break-all;
    }
  }
</style>
