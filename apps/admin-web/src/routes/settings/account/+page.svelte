<script lang="ts">
  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import DangerZone from '$lib/components/settings/DangerZone.svelte'
  import { adminApi, AdminApiError } from '$lib/api'
  import { session, clearSession } from '$lib/session'
  import { goto } from '$app/navigation'

  // Identity facts come from the live JWT; refresh on mount.
  const adminId = $derived($session?.claims.sub ?? '—')
  const issued = $derived(
    $session ? new Date($session.claims.iat * 1000).toLocaleString() : '—',
  )
  const expires = $derived(
    $session ? new Date($session.claims.exp * 1000).toLocaleString() : '—',
  )

  // ── password rotation ───────────────────────────────────────────
  let next = $state('')
  let confirmNext = $state('')
  let saving = $state(false)
  let errorMsg = $state<string | null>(null)
  let flash = $state<'rotated' | null>(null)

  async function rotatePassword(event: SubmitEvent) {
    event.preventDefault()
    if (!next || saving) return
    errorMsg = null
    flash = null
    if (next.length < 12) {
      errorMsg = 'Use at least 12 characters.'
      return
    }
    if (next !== confirmNext) {
      errorMsg = 'Passwords do not match.'
      return
    }
    saving = true
    try {
      await adminApi.call('/v1/admin/config/admin.password', {
        method: 'PUT',
        json: { value: next, updated_by: 'admin-web' },
      })
      next = ''
      confirmNext = ''
      flash = 'rotated'
    } catch (err) {
      errorMsg =
        err instanceof AdminApiError
          ? err.message
          : 'Rotation failed'
    } finally {
      saving = false
    }
  }

  async function signOut() {
    if (!confirm('Sign out now? You will be redirected to the login screen.'))
      return
    try {
      await adminApi.logout()
    } finally {
      clearSession()
      await goto('/login', { replaceState: true })
    }
  }
</script>

<PageHeader
  path={['Settings', 'Account']}
  title="Profile & security"
  description="Manage how you sign in to this instance. The bootstrap password
              and JWT secrets are generated at first deploy; rotate them from here."
/>

<div class="stack">
  <SettingsCard
    title="Profile"
    description="Read-only summary of the current admin session. The admin id is set as
                 a Worker variable on apps/admin-api (ADMIN_ID); changing it requires
                 a redeploy."
    status={badgeSession}
  >
    <ul class="kv">
      <li><span>Admin id</span><code>{adminId}</code></li>
      <li><span>Session issued</span><code>{issued}</code></li>
      <li><span>Session expires</span><code>{expires}</code></li>
      <li><span>Refresh</span><code>rotated on every use</code></li>
    </ul>
  </SettingsCard>

  <SettingsCard
    title="Password"
    description="The admin password gates /auth/login on admin-api. Stored at
                 config.admin.password and read via packages/config's 5-minute
                 colo-local cache — propagation completes within that window."
  >
    <form onsubmit={rotatePassword} class="pw-form">
      <label>
        <span>New password</span>
        <input
          type="password"
          autocomplete="new-password"
          minlength="12"
          required
          bind:value={next}
          disabled={saving}
        />
      </label>
      <label>
        <span>Confirm new password</span>
        <input
          type="password"
          autocomplete="new-password"
          minlength="12"
          required
          bind:value={confirmNext}
          disabled={saving}
        />
      </label>

      <p class="hint">
        Minimum 12 characters. The new value is written to the config D1; no
        password hashing — the comparison is constant-time plaintext.
      </p>

      <div class="actions">
        <button
          type="submit"
          class="btn primary"
          disabled={!next || !confirmNext || saving}
        >
          {saving ? 'Rotating…' : 'Rotate password'}
        </button>
      </div>

      {#if errorMsg}
        <p class="msg error">{errorMsg}</p>
      {:else if flash === 'rotated'}
        <p class="msg ok">
          Password rotated. New sign-ins use the new value within 5 minutes.
        </p>
      {/if}
    </form>
  </SettingsCard>

  <DangerZone>
    <div class="danger-row">
      <div>
        <strong>Sign out current session</strong>
        <p class="hint">
          Revokes the refresh token tied to this browser. Other devices remain
          signed in until their own refresh tokens are revoked.
        </p>
      </div>
      <button type="button" class="btn danger" onclick={signOut}>
        Sign out
      </button>
    </div>
  </DangerZone>
</div>

{#snippet badgeSession()}
  {#if $session}
    <StatusBadge tone="success" dot>active</StatusBadge>
  {:else}
    <StatusBadge tone="destructive">no session</StatusBadge>
  {/if}
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .kv {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;

    li {
      display: flex;
      justify-content: space-between;
      gap: $space-4;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-size: $font-size-sm;

      &:last-child { border-bottom: none; }
      span { color: var(--muted-foreground); }
      code {
        font-family: $font-mono;
        font-size: $font-size-xs;
        color: var(--foreground);
      }
    }
  }

  .pw-form {
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;

    span {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted-foreground);
    }
  }

  input {
    width: 100%;
    padding: $space-2 $space-3;
    font-family: $font-mono;
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
    &:disabled { opacity: 0.6; cursor: not-allowed; }
  }

  .hint {
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }

  .actions {
    display: flex;
    gap: $space-2;
    margin-top: $space-2;
  }

  .btn {
    padding: $space-2 $space-4;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    border-radius: $radius-md;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter $transition-fast, background $transition-fast;

    &.primary {
      background: var(--primary);
      color: var(--primary-foreground);
      &:hover:not(:disabled) { filter: brightness(1.08); }
    }
    &.danger {
      background: var(--destructive);
      color: var(--destructive-foreground);
      &:hover:not(:disabled) { filter: brightness(1.08); }
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .msg {
    font-size: $font-size-xs;
    margin-top: 2px;
    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
  }

  .danger-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-4;

    strong {
      display: block;
      font-size: $font-size-sm;
      font-weight: $font-weight-semibold;
    }
  }
</style>
