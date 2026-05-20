<script lang="ts">
  // Identity settings — email domain allow-list governing which hosts
  // may start a human registration (POST /v1/humans).
  //
  // Two-card layout:
  //   1. "Currently allowed" — read-only summary of whatever is in
  //      effect right now (override list OR in-code defaults).
  //   2. "Override" — editable list. Saving writes
  //      `identity.allowed_email_domains` to the config D1; clearing
  //      it reverts to the defaults.

  import { onMount } from 'svelte'
  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  const ALLOWED_KEY = 'identity.allowed_email_domains'

  // Mirror of packages/identity/src/service/human.ts
  // DEFAULT_ALLOWED_EMAIL_DOMAINS — kept in sync manually for now;
  // small enough that drift is easy to notice in code review.
  type DomainGroup = { label: string; domains: string[] }
  const DEFAULT_GROUPS: DomainGroup[] = [
    { label: 'Google', domains: ['gmail.com', 'googlemail.com'] },
    {
      label: 'Microsoft',
      domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'microsoft.com'],
    },
    { label: 'Apple', domains: ['icloud.com', 'me.com', 'mac.com'] },
    { label: 'Yahoo', domains: ['yahoo.com', 'yahoo.co.kr'] },
    {
      label: 'Korean portals',
      domains: ['naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'nate.com'],
    },
  ]
  const DEFAULTS = DEFAULT_GROUPS.flatMap((g) => g.domains)

  type ConfigEntry = {
    id: string
    key: string
    value: unknown
    updated_at: string
    updated_by: string | null
  }

  let loading = $state(true)
  /** null = no override row exists; defaults apply. */
  let override = $state<string[] | null>(null)
  /** Editable buffer. Mirrors override (or defaults) until the user edits. */
  let working = $state<string[]>([])
  let updatedAt = $state<string | null>(null)
  let updatedBy = $state<string | null>(null)

  let input = $state('')
  let inputError = $state<string | null>(null)
  let saving = $state(false)
  let saveError = $state<string | null>(null)
  let flash = $state<'saved' | 'reset' | null>(null)

  // ── derived ────────────────────────────────────────────────────────

  /** What's actually enforced server-side right now. */
  const effective = $derived(override ?? DEFAULTS)
  const usingDefaults = $derived(override === null)

  /** Working buffer differs from the persisted state? */
  const dirty = $derived.by(() => {
    const base = override ?? []  // when defaults, baseline for dirty check is "no override"
    if (override === null && working.length === 0) return false
    if (working.length !== base.length) return true
    const a = [...working].sort()
    const b = [...base].sort()
    return a.some((d, i) => d !== b[i])
  })

  // ── validators ─────────────────────────────────────────────────────

  const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

  function validate(value: string, scope: string[]): string | null {
    const v = value.trim().toLowerCase()
    if (!v) return 'Enter a domain'
    if (!DOMAIN_RE.test(v)) return 'Invalid domain'
    if (scope.includes(v)) return 'Already in list'
    return null
  }

  // ── load / save / reset ────────────────────────────────────────────

  async function load() {
    loading = true
    saveError = null
    try {
      const entry = await adminApi
        .call<ConfigEntry>(`/v1/admin/config/${ALLOWED_KEY}`)
        .catch((err) => {
          if (err instanceof AdminApiError && err.status === 404) return null
          throw err
        })
      if (entry && Array.isArray(entry.value)) {
        const list = (entry.value as unknown[])
          .filter((d): d is string => typeof d === 'string')
          .map((d) => d.trim().toLowerCase())
        override = list
        working = [...list]
        updatedAt = entry.updated_at
        updatedBy = entry.updated_by
      } else {
        override = null
        working = []
        updatedAt = null
        updatedBy = null
      }
    } catch (err) {
      saveError = err instanceof AdminApiError ? err.message : 'Failed to load'
    } finally {
      loading = false
    }
  }

  onMount(load)

  function customizeFromDefaults() {
    working = [...DEFAULTS]
    flash = null
    saveError = null
    // mark dirty by ensuring override stays null but working has content
  }

  function add(event: SubmitEvent) {
    event.preventDefault()
    const err = validate(input, working)
    if (err) {
      inputError = err
      return
    }
    working = [...working, input.trim().toLowerCase()]
    input = ''
    inputError = null
  }

  function remove(d: string) {
    working = working.filter((x) => x !== d)
  }

  async function save() {
    if (saving) return
    saving = true
    saveError = null
    flash = null
    try {
      const entry = await adminApi.call<ConfigEntry>(
        `/v1/admin/config/${ALLOWED_KEY}`,
        {
          method: 'PUT',
          json: { value: working, updated_by: 'admin-web' },
        },
      )
      if (Array.isArray(entry.value)) {
        const list = (entry.value as unknown[])
          .filter((d): d is string => typeof d === 'string')
          .map((d) => d.toLowerCase())
        override = list
        working = [...list]
      }
      updatedAt = entry.updated_at
      updatedBy = entry.updated_by
      flash = 'saved'
    } catch (err) {
      saveError = err instanceof AdminApiError ? err.message : 'Save failed'
    } finally {
      saving = false
    }
  }

  async function resetToDefaults() {
    if (
      !confirm(
        'Remove the override?\nThe in-code default list will apply once the 5-minute cache window elapses on the api Worker.',
      )
    )
      return
    saving = true
    saveError = null
    flash = null
    try {
      await adminApi.call(`/v1/admin/config/${ALLOWED_KEY}`, {
        method: 'DELETE',
      })
      override = null
      working = []
      updatedAt = null
      updatedBy = null
      flash = 'reset'
    } catch (err) {
      saveError = err instanceof AdminApiError ? err.message : 'Reset failed'
    } finally {
      saving = false
    }
  }
</script>

<PageHeader
  path={['Settings', 'Identity']}
  title="Domain allow-list"
  description="Restrict which email domains can start a human registration. The
              defaults below are baked into packages/identity; saving an override
              replaces them entirely."
/>

<div class="stack">
  <SettingsCard
    title="Currently allowed"
    description="The exact set of domains that POST /v1/humans accepts right now.
                 Updates propagate within the 5-minute colo-local TTL on the api
                 Worker."
    status={badgeEffective}
  >
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if usingDefaults}
      <p class="muted small">
        No override is set. The in-code default list applies — group breakdown:
      </p>
      <div class="groups">
        {#each DEFAULT_GROUPS as group}
          <div class="group">
            <span class="group-label">{group.label}</span>
            <ul class="chips read-only">
              {#each group.domains as d}
                <li><code>{d}</code></li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
      <p class="muted small foot">
        {effective.length} domain{effective.length === 1 ? '' : 's'} total ·
        defined in <code>packages/identity/src/service/human.ts</code>
      </p>
    {:else if override !== null && override.length === 0}
      <p class="warn">
        Override is set to an <strong>empty list</strong> — registration is
        currently impossible. Remove the override below to fall back to defaults,
        or add at least one domain.
      </p>
    {:else}
      <ul class="chips read-only">
        {#each effective as d}
          <li><code>{d}</code></li>
        {/each}
      </ul>
      <p class="muted small foot">
        {effective.length} domain{effective.length === 1 ? '' : 's'} ·
        {#if updatedAt}
          set {new Date(updatedAt).toLocaleString()}{#if updatedBy} by <code>{updatedBy}</code>{/if}
        {/if}
      </p>
    {/if}
  </SettingsCard>

  <SettingsCard
    title="Override"
    description="When set, this list completely replaces the defaults. Leave unset
                 to keep the defaults in effect — the safest option for a fresh
                 deploy."
    status={badgeOverride}
  >
    {#if loading}
      <p class="muted">Loading…</p>
    {:else if override === null && working.length === 0}
      <div class="empty-state">
        <p class="muted small">
          No override is configured. Click below to copy the defaults into an
          editable list, then add or remove domains before saving.
        </p>
        <button type="button" class="btn primary" onclick={customizeFromDefaults}>
          Customize from defaults
        </button>
      </div>
    {:else}
      <form onsubmit={add} class="add">
        <input
          type="text"
          placeholder="example.com"
          spellcheck="false"
          autocapitalize="off"
          bind:value={input}
          disabled={saving}
        />
        <button
          type="submit"
          class="btn primary"
          disabled={!input.trim() || saving}
        >
          Add
        </button>
      </form>

      {#if inputError}
        <p class="msg error">{inputError}</p>
      {/if}

      {#if working.length === 0}
        <p class="warn">
          The override list is empty. Saving as-is blocks all registrations.
        </p>
      {:else}
        <ul class="chips">
          {#each working as d}
            <li>
              <code>{d}</code>
              <button
                type="button"
                class="chip-remove"
                onclick={() => remove(d)}
                aria-label="Remove {d}"
                disabled={saving}
              >×</button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="actions">
        <button
          type="button"
          class="btn primary"
          onclick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : override === null ? 'Save override' : 'Save changes'}
        </button>
        {#if override !== null}
          <button
            type="button"
            class="btn danger-ghost"
            onclick={resetToDefaults}
            disabled={saving}
          >
            Reset to defaults
          </button>
        {/if}
        {#if override === null && working.length > 0}
          <button
            type="button"
            class="btn ghost"
            onclick={() => (working = [])}
            disabled={saving}
          >
            Discard
          </button>
        {/if}
      </div>

      {#if saveError}
        <p class="msg error">{saveError}</p>
      {:else if flash === 'saved'}
        <p class="msg ok">
          Saved. New registrations validate against this list within the
          5-minute cache window.
        </p>
      {:else if flash === 'reset'}
        <p class="msg ok">Override removed. The default list applies again.</p>
      {/if}
    {/if}
  </SettingsCard>

  <SettingsCard
    title="JWT audiences"
    description="The audience strings each Worker accepts in agent JWTs. Stored as
                 [vars].JWT_AUDIENCE in wrangler.toml — changing them requires a
                 redeploy."
    stacked
  >
    <ul class="kv">
      <li>
        <span>api worker</span>
        <code>apps/api/wrangler.toml → JWT_AUDIENCE</code>
      </li>
      <li>
        <span>mail worker</span>
        <code>apps/mail/wrangler.toml → JWT_AUDIENCE</code>
      </li>
    </ul>
  </SettingsCard>
</div>

{#snippet badgeEffective()}
  {#if loading}
    <StatusBadge tone="muted">loading</StatusBadge>
  {:else if usingDefaults}
    <StatusBadge tone="info">defaults · {effective.length}</StatusBadge>
  {:else if override !== null && override.length === 0}
    <StatusBadge tone="destructive">empty override</StatusBadge>
  {:else}
    <StatusBadge tone="success" dot>override · {effective.length}</StatusBadge>
  {/if}
{/snippet}

{#snippet badgeOverride()}
  {#if loading}
    <StatusBadge tone="muted">loading</StatusBadge>
  {:else if dirty}
    <StatusBadge tone="warning">unsaved</StatusBadge>
  {:else if override === null}
    <StatusBadge tone="muted">unset</StatusBadge>
  {:else}
    <StatusBadge tone="success">saved · {override.length}</StatusBadge>
  {/if}
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .add {
    display: flex;
    gap: $space-2;
  }

  input {
    flex: 1;
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

  .groups {
    display: flex;
    flex-direction: column;
    gap: $space-3;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .group-label {
    font-size: $font-size-xs;
    font-weight: $font-weight-semibold;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted-foreground);
  }

  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 4px 4px 10px;
      background: var(--accent);
      border: 1px solid var(--border);
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-family: $font-mono;
    }

    &.read-only li {
      padding: 4px 10px;
      background: transparent;
      border-color: var(--border);
    }
  }

  .chip-remove {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--muted-foreground);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;

    &:hover { background: var(--muted); color: var(--foreground); }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: $space-3;
    padding: $space-4;
    border: 1px dashed var(--border);
    border-radius: $radius-md;
  }

  .actions {
    display: flex;
    gap: $space-2;
    flex-wrap: wrap;
    margin-top: $space-2;
  }

  .btn {
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    border-radius: $radius-md;
    border: 1px solid transparent;
    cursor: pointer;
    transition: filter $transition-fast, background $transition-fast;

    &.primary {
      background: var(--primary);
      color: var(--primary-foreground);
      &:hover:not(:disabled) { filter: brightness(1.08); }
    }
    &.ghost {
      background: transparent;
      color: var(--foreground);
      border-color: var(--border);
      &:hover:not(:disabled) { background: var(--accent); }
    }
    &.danger-ghost {
      background: transparent;
      color: var(--destructive);
      border-color: color-mix(in oklch, var(--destructive) 36%, transparent);
      &:hover:not(:disabled) {
        background: color-mix(in oklch, var(--destructive) 12%, transparent);
      }
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .msg {
    font-size: $font-size-xs;
    margin-top: 2px;
    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
  }

  .warn {
    padding: $space-3;
    background: color-mix(in oklch, var(--destructive) 10%, transparent);
    border: 1px solid color-mix(in oklch, var(--destructive) 28%, transparent);
    border-radius: $radius-md;
    font-size: $font-size-xs;
    color: var(--foreground);
    line-height: $line-height-relaxed;

    strong { color: var(--destructive); }
  }

  .muted {
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
  .small { font-size: $font-size-xs; }
  .foot { margin-top: $space-2; }

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
      padding: 8px 0;
      font-size: $font-size-sm;
      border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
      span { color: var(--muted-foreground); }
      code {
        font-family: $font-mono;
        font-size: $font-size-xs;
        color: var(--foreground);
      }
    }
  }
</style>
