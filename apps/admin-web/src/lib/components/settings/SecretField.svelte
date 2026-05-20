<script lang="ts">
  // Reusable secret-or-text field used across settings forms. Handles
  // load / set / rotate / clear against an admin-api `/v1/admin/config`
  // key and renders the GitHub-style "current value + edit row" pattern.

  import { onMount } from 'svelte'
  import { adminApi, AdminApiError } from '$lib/api'
  import StatusBadge from './StatusBadge.svelte'

  type Props = {
    configKey: string
    label: string
    /** Optional 1-line helper text shown under the input. */
    hint?: string
    placeholder?: string
    /** When true the input is type=password; otherwise type=text. */
    secret?: boolean
    /** Optional callback fired after a successful save/clear so a
     *  parent page can refresh derived state (e.g. "effective sender"). */
    onChange?: (stored: string | null) => void
  }

  let {
    configKey,
    label,
    hint,
    placeholder,
    secret = false,
    onChange,
  }: Props = $props()

  type ConfigEntry = {
    id: string
    key: string
    value: unknown
    updated_at: string
    updated_by: string | null
  }

  let loading = $state(true)
  let stored = $state<string | null>(null)
  let updatedAt = $state<string | null>(null)
  let input = $state('')
  let saving = $state(false)
  let errorMsg = $state<string | null>(null)
  let flash = $state<'saved' | 'cleared' | null>(null)
  let editing = $state(false)

  function reveal() {
    editing = true
    flash = null
    errorMsg = null
    // microtask so the input mounts then focuses
    queueMicrotask(() => {
      const el = document.getElementById(`secret-${configKey}`)
      if (el instanceof HTMLInputElement) el.focus()
    })
  }

  function cancel() {
    input = ''
    editing = false
    errorMsg = null
  }

  async function fetchEntry(): Promise<ConfigEntry | null> {
    try {
      return await adminApi.call<ConfigEntry>(`/v1/admin/config/${configKey}`)
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 404) return null
      throw e
    }
  }

  onMount(async () => {
    try {
      const entry = await fetchEntry()
      if (entry) {
        stored = typeof entry.value === 'string' ? entry.value : ''
        updatedAt = entry.updated_at
      }
    } catch (err) {
      errorMsg = err instanceof AdminApiError ? err.message : 'Failed to load'
    } finally {
      loading = false
    }
  })

  async function save() {
    if (!input || saving) return
    saving = true
    errorMsg = null
    flash = null
    try {
      const entry = await adminApi.call<ConfigEntry>(`/v1/admin/config/${configKey}`, {
        method: 'PUT',
        json: { value: input, updated_by: 'admin-web' },
      })
      stored = typeof entry.value === 'string' ? entry.value : input
      updatedAt = entry.updated_at
      input = ''
      editing = false
      flash = 'saved'
      onChange?.(stored)
    } catch (err) {
      errorMsg = err instanceof AdminApiError ? err.message : 'Save failed'
    } finally {
      saving = false
    }
  }

  async function clearVal() {
    if (saving || !stored) return
    if (!confirm(`Remove ${configKey} from the config D1?`)) return
    saving = true
    errorMsg = null
    flash = null
    try {
      await adminApi.call(`/v1/admin/config/${configKey}`, { method: 'DELETE' })
      stored = null
      updatedAt = null
      flash = 'cleared'
      onChange?.(null)
    } catch (err) {
      errorMsg = err instanceof AdminApiError ? err.message : 'Clear failed'
    } finally {
      saving = false
    }
  }

  function mask(v: string): string {
    if (v.length <= 6) return '••••••'
    return `${v.slice(0, 3)}••••${v.slice(-3)}`
  }
</script>

<div class="field">
  <div class="head">
    <div class="meta">
      <label for={`secret-${configKey}`}>
        <span class="label">{label}</span>
      </label>
      <code class="ckey">{configKey}</code>
    </div>
    {#if loading}
      <StatusBadge tone="muted">loading</StatusBadge>
    {:else if stored}
      <StatusBadge tone="success" dot>set</StatusBadge>
    {:else}
      <StatusBadge tone="muted">unset</StatusBadge>
    {/if}
  </div>

  {#if loading}
    <p class="hint">…</p>
  {:else if stored && !editing}
    <div class="current">
      <code>{mask(stored)}</code>
      {#if updatedAt}
        <span class="muted">updated {new Date(updatedAt).toLocaleString()}</span>
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="btn ghost" onclick={reveal}>Rotate</button>
      <button type="button" class="btn danger-ghost" onclick={clearVal} disabled={saving}>
        Clear
      </button>
    </div>
  {:else}
    <div class="row">
      <input
        id={`secret-${configKey}`}
        type={secret ? 'password' : 'text'}
        autocomplete="off"
        spellcheck="false"
        {placeholder}
        bind:value={input}
        disabled={saving}
      />
      <button
        type="button"
        class="btn primary"
        onclick={save}
        disabled={!input || saving}
      >
        {saving ? 'Saving…' : stored ? 'Update' : 'Save'}
      </button>
      {#if editing}
        <button type="button" class="btn ghost" onclick={cancel} disabled={saving}>
          Cancel
        </button>
      {/if}
    </div>
    {#if hint}<p class="hint">{hint}</p>{/if}
  {/if}

  {#if errorMsg}
    <p class="message error">{errorMsg}</p>
  {:else if flash === 'saved'}
    <p class="message ok">Saved.</p>
  {:else if flash === 'cleared'}
    <p class="message ok">Removed.</p>
  {/if}
</div>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .field {
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-3;
  }

  .meta {
    display: flex;
    align-items: baseline;
    gap: $space-2;
    flex-wrap: wrap;
  }
  .label {
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
  }
  .ckey {
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }

  .current {
    display: flex;
    align-items: baseline;
    gap: $space-3;
    flex-wrap: wrap;
    padding: $space-2 $space-3;
    background: var(--muted);
    border-radius: $radius-md;

    code {
      font-family: $font-mono;
      font-size: $font-size-sm;
      color: var(--foreground);
    }
    .muted {
      font-size: $font-size-xs;
      color: var(--muted-foreground);
    }
  }

  .actions {
    display: flex;
    gap: $space-2;
  }

  .row {
    display: flex;
    align-items: center;
    gap: $space-2;
    flex-wrap: wrap;
  }

  input {
    flex: 1;
    min-width: 200px;
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

  .btn {
    padding: $space-2 $space-3;
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
    &.ghost {
      background: transparent;
      color: var(--foreground);
      border-color: var(--border);

      &:hover:not(:disabled) {
        background: var(--accent);
      }
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

  .message {
    font-size: $font-size-xs;
    margin-top: 2px;

    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
  }
</style>
