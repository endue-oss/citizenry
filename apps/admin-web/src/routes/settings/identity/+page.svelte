<script lang="ts">
  // Identity settings — email domain allow-list governing which hosts
  // may start a human registration (POST /v1/humans).
  //
  // Single-card model: a built-in default list is always allowed. Admins
  // layer their own domains on top — only those custom additions are
  // editable and rendered in a distinct colour. Saving writes the full
  // (defaults + custom) set to `identity.allowed_email_domains`; removing
  // every custom entry deletes the override so the pure defaults apply.

  import { onMount } from 'svelte'
  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  const ALLOWED_KEY = 'identity.allowed_email_domains'

  // Mirror of packages/identity/src/service/human.ts
  // DEFAULT_ALLOWED_EMAIL_DOMAINS — kept in sync manually for now;
  // small enough that drift is easy to notice in code review.
  const DEFAULTS = [
    // Korea
    'naver.com', 'kakao.com', 'daum.net', 'hanmail.net', 'nate.com',
    // China — top 5
    'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net',
    'sina.com', 'sina.cn', 'sohu.com', 'aliyun.com',
    // Global 50M+
    'gmail.com', 'googlemail.com',
    'icloud.com', 'me.com', 'mac.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com', 'rocketmail.com',
    'yahoo.co.jp', 'yahoo.co.kr', 'yahoo.fr', 'yahoo.co.uk',
    'yahoo.de', 'yahoo.com.br', 'yahoo.com.mx',
    'proton.me', 'protonmail.com', 'pm.me',
    'mail.ru', 'list.ru', 'bk.ru', 'inbox.ru',
    'yandex.com', 'yandex.ru', 'ya.ru',
  ]
  const DEFAULT_SET = new Set(DEFAULTS)

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
  /** Editable buffer of custom (non-default) domains only. */
  let custom = $state<string[]>([])
  let updatedAt = $state<string | null>(null)
  let updatedBy = $state<string | null>(null)

  let input = $state('')
  let inputError = $state<string | null>(null)
  let saving = $state(false)
  let saveError = $state<string | null>(null)
  let flash = $state<'saved' | 'reset' | null>(null)

  // ── derived ────────────────────────────────────────────────────────

  /** Custom domains currently persisted (effective minus the defaults). */
  const persistedCustom = $derived(
    (override ?? []).filter((d) => !DEFAULT_SET.has(d)),
  )

  /** Working buffer differs from the persisted custom set? */
  const dirty = $derived.by(() => {
    if (custom.length !== persistedCustom.length) return true
    const a = [...custom].sort()
    const b = [...persistedCustom].sort()
    return a.some((d, i) => d !== b[i])
  })

  const totalCount = $derived(DEFAULTS.length + custom.length)

  // ── validators ─────────────────────────────────────────────────────

  const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

  function validate(value: string): string | null {
    const v = value.trim().toLowerCase()
    if (!v) return 'Enter a domain'
    if (!DOMAIN_RE.test(v)) return 'Invalid domain'
    if (DEFAULT_SET.has(v)) return 'Already allowed by default'
    if (custom.includes(v)) return 'Already added'
    return null
  }

  // ── load / save ────────────────────────────────────────────────────

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
        custom = list.filter((d) => !DEFAULT_SET.has(d))
        updatedAt = entry.updated_at
        updatedBy = entry.updated_by
      } else {
        override = null
        custom = []
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

  function add(event: SubmitEvent) {
    event.preventDefault()
    const err = validate(input)
    if (err) {
      inputError = err
      return
    }
    custom = [...custom, input.trim().toLowerCase()]
    input = ''
    inputError = null
    flash = null
  }

  function remove(d: string) {
    custom = custom.filter((x) => x !== d)
    flash = null
  }

  async function save() {
    if (saving || !dirty) return
    saving = true
    saveError = null
    flash = null
    try {
      if (custom.length === 0) {
        // No custom additions left — drop the override entirely so the
        // in-code defaults apply on their own.
        await adminApi.call(`/v1/admin/config/${ALLOWED_KEY}`, {
          method: 'DELETE',
        })
        override = null
        custom = []
        updatedAt = null
        updatedBy = null
        flash = 'reset'
        return
      }
      const value = [...DEFAULTS, ...custom]
      const entry = await adminApi.call<ConfigEntry>(
        `/v1/admin/config/${ALLOWED_KEY}`,
        { method: 'PUT', json: { value, updated_by: 'admin-web' } },
      )
      if (Array.isArray(entry.value)) {
        const list = (entry.value as unknown[])
          .filter((d): d is string => typeof d === 'string')
          .map((d) => d.toLowerCase())
        override = list
        custom = list.filter((d) => !DEFAULT_SET.has(d))
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

  function discard() {
    custom = [...persistedCustom]
    input = ''
    inputError = null
    saveError = null
    flash = null
  }
</script>

<PageHeader
  path={['Settings', 'Identity']}
  title="Domain allow-list"
  description="Restrict which email domains can start a human registration. A built-in
              default list is always allowed; the domains you add here are layered
              on top and highlighted."
/>

<div class="stack">
  <SettingsCard
    title="Currently allowed"
    description="The exact set of domains that POST /v1/humans accepts right now.
                 Built-in defaults are shown plain; your additions are highlighted
                 and editable. Updates propagate within the 5-minute colo-local TTL
                 on the api Worker."
    status={badgeEffective}
  >
    {#if loading}
      <p class="muted">Loading…</p>
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
          Add domain
        </button>
      </form>

      {#if inputError}
        <p class="msg error">{inputError}</p>
      {/if}

      <ul class="chips">
        {#each DEFAULTS as d}
          <li class="default"><code>{d}</code></li>
        {/each}
        {#each custom as d}
          <li class="custom">
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

      <p class="muted small foot">
        {totalCount} domain{totalCount === 1 ? '' : 's'} ·
        {DEFAULTS.length} built-in default{DEFAULTS.length === 1 ? '' : 's'}
        {#if custom.length > 0}
          + {custom.length} custom
        {/if}
        {#if !dirty && custom.length > 0 && updatedAt}
          · last set {new Date(updatedAt).toLocaleString()}{#if updatedBy} by <code>{updatedBy}</code>{/if}
        {/if}
      </p>

      {#if custom.length === 0}
        <p class="muted small">
          No custom domains. Only the built-in defaults apply.
        </p>
      {/if}

      <div class="actions">
        <button
          type="button"
          class="btn primary"
          onclick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {#if dirty}
          <button
            type="button"
            class="btn ghost"
            onclick={discard}
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
        <p class="msg ok">
          All custom domains removed. Only the built-in defaults apply now.
        </p>
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
  {:else if dirty}
    <StatusBadge tone="warning">unsaved</StatusBadge>
  {:else if custom.length > 0}
    <StatusBadge tone="success" dot>{custom.length} custom · {totalCount}</StatusBadge>
  {:else}
    <StatusBadge tone="info">defaults · {totalCount}</StatusBadge>
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

  .chips {
    list-style: none;
    margin: $space-3 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: $radius-full;
      font-size: $font-size-xs;
      font-family: $font-mono;
    }

    // Built-in defaults — plain, read-only.
    li.default {
      padding: 4px 10px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted-foreground);
    }

    // Admin-added domains — highlighted, removable.
    li.custom {
      padding: 4px 4px 4px 10px;
      background: color-mix(in oklch, var(--primary) 16%, transparent);
      border: 1px solid color-mix(in oklch, var(--primary) 42%, transparent);
      color: var(--foreground);

      code { color: var(--primary); font-weight: $font-weight-medium; }
    }
  }

  .chip-remove {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;

    &:hover { background: color-mix(in oklch, var(--primary) 24%, transparent); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .actions {
    display: flex;
    gap: $space-2;
    flex-wrap: wrap;
    margin-top: $space-3;
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
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .msg {
    font-size: $font-size-xs;
    margin-top: $space-2;
    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
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
  .foot { margin-top: $space-3; }

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
