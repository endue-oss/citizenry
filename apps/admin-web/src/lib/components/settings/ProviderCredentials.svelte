<script lang="ts">
  // Grouped credential editor: several config keys edited together and
  // persisted with a single Save. Used by multi-field outbound providers
  // (AWS SES, Google). Plain-text fields are prefilled and removed when
  // cleared; secret fields are never echoed back and kept on blank.
  //
  // No per-field status pill — the parent panel header shows the
  // active/not-set summary, derived from `onState`.

  import { onMount } from 'svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  type Field = {
    key: string
    label: string
    placeholder?: string
    secret?: boolean
    hint?: string
  }

  type Props = {
    fields: Field[]
    /** Keys that must all be stored for the provider to count as active. */
    requiredKeys: string[]
    /** Fired after load and after save with the computed active state. */
    onState?: (active: boolean) => void
    /** Label for the save button. */
    saveLabel?: string
  }

  let { fields, requiredKeys, onState, saveLabel = 'Save' }: Props = $props()

  let inputs = $state<Record<string, string>>({})
  let baseline = $state<Record<string, string>>({})
  let stored = $state<Record<string, boolean>>({})
  let saving = $state(false)
  let error = $state<string | null>(null)
  let flash = $state(false)

  const dirty = $derived(
    fields.some((f) => (inputs[f.key] ?? '') !== (baseline[f.key] ?? '')),
  )

  function emitState() {
    onState?.(requiredKeys.every((k) => stored[k]))
  }

  async function fetchKey(key: string): Promise<string | null> {
    try {
      const entry = await adminApi.call<{ value: unknown }>(`/v1/admin/config/${key}`)
      return typeof entry.value === 'string' ? entry.value : null
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 404) return null
      throw e
    }
  }

  async function load() {
    error = null
    try {
      for (const f of fields) {
        const val = await fetchKey(f.key)
        stored[f.key] = !!val
        const initial = f.secret ? '' : (val ?? '')
        inputs[f.key] = initial
        baseline[f.key] = initial
      }
      emitState()
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Failed to load'
    }
  }

  onMount(load)

  async function save() {
    if (saving || !dirty) return
    saving = true
    error = null
    flash = false
    try {
      for (const f of fields) {
        const v = (inputs[f.key] ?? '').trim()
        const base = baseline[f.key] ?? ''
        if (v === base) continue // unchanged
        if (v) {
          await adminApi.call(`/v1/admin/config/${f.key}`, {
            method: 'PUT',
            json: { value: v, updated_by: 'admin-web' },
          })
        } else {
          // A cleared plain-text field is removed. Secrets keep their
          // stored value on blank (blank === baseline, skipped above).
          await adminApi.call(`/v1/admin/config/${f.key}`, { method: 'DELETE' })
        }
      }
      await load()
      flash = true
    } catch (err) {
      error = err instanceof AdminApiError ? err.message : 'Save failed'
    } finally {
      saving = false
    }
  }
</script>

<div class="group">
  {#each fields as f (f.key)}
    <div class="field">
      <div class="field-head">
        <label for={`cred-${f.key}`}>{f.label}</label>
        <code class="ckey">{f.key}</code>
      </div>
      <input
        id={`cred-${f.key}`}
        type={f.secret ? 'password' : 'text'}
        autocomplete="off"
        spellcheck="false"
        placeholder={f.secret && stored[f.key]
          ? '•••••• — stored, leave blank to keep'
          : (f.placeholder ?? '')}
        bind:value={inputs[f.key]}
        disabled={saving}
      />
      {#if f.hint}<p class="hint">{f.hint}</p>{/if}
    </div>
  {/each}

  <div class="actions">
    {#if error}
      <p class="msg error">{error}</p>
    {:else if flash}
      <p class="msg ok">Saved.</p>
    {/if}
    <span class="spacer"></span>
    <button type="button" class="btn primary" onclick={save} disabled={!dirty || saving}>
      {saving ? 'Saving…' : saveLabel}
    </button>
  </div>
</div>

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .group {
    display: flex;
    flex-direction: column;
    gap: $space-4;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: $space-2;

    .field-head {
      display: flex;
      align-items: baseline;
      gap: $space-2;
      flex-wrap: wrap;

      label {
        font-size: $font-size-sm;
        font-weight: $font-weight-medium;
      }
      .ckey {
        font-family: $font-mono;
        font-size: $font-size-xs;
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
  }

  .actions {
    display: flex;
    align-items: center;
    gap: $space-3;
    margin-top: $space-1;

    .spacer { flex: 1; }
  }

  .msg {
    font-size: $font-size-xs;
    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
  }

  .btn {
    padding: $space-2 $space-4;
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
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
</style>
