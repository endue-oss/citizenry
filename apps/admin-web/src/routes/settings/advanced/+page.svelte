<script lang="ts">
  // Advanced — raw config D1 key/value editor. Lists every row, lets
  // operators inspect, edit, and delete by key. New keys are added via
  // the form at the top. Value column is masked when the value looks
  // secret-y; click to reveal in an inline editor.

  import { onMount } from 'svelte'
  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  type Row = {
    id: string
    key: string
    value: unknown
    updated_at: string
    updated_by: string | null
  }

  let loading = $state(true)
  let rows = $state<Row[]>([])
  let listError = $state<string | null>(null)
  let filter = $state('')

  // ── load ─────────────────────────────────────────────────────────
  async function load() {
    loading = true
    listError = null
    try {
      const resp = await adminApi.call<{ items: Row[] }>('/v1/admin/config')
      rows = resp.items.sort((a, b) => a.key.localeCompare(b.key))
    } catch (err) {
      listError = err instanceof AdminApiError ? err.message : 'Failed to load'
    } finally {
      loading = false
    }
  }

  onMount(load)

  // ── filter ────────────────────────────────────────────────────────
  const visible = $derived(
    filter.trim()
      ? rows.filter((r) => r.key.toLowerCase().includes(filter.trim().toLowerCase()))
      : rows,
  )

  // ── new key form ─────────────────────────────────────────────────
  let newKey = $state('')
  let newValue = $state('')
  let newError = $state<string | null>(null)
  let creating = $state(false)

  const KEY_RE = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/

  async function createKey(event: SubmitEvent) {
    event.preventDefault()
    newError = null
    if (!KEY_RE.test(newKey)) {
      newError = 'Use {namespace}.{keyname} — lowercase a-z/0-9/_'
      return
    }
    if (!newValue) {
      newError = 'Value required'
      return
    }
    let parsedValue: unknown = newValue
    if (newValue.trim().startsWith('{') || newValue.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(newValue)
      } catch {
        newError = 'Value looks like JSON but does not parse'
        return
      }
    }
    creating = true
    try {
      await adminApi.call(`/v1/admin/config/${newKey}`, {
        method: 'PUT',
        json: { value: parsedValue, updated_by: 'admin-web' },
      })
      newKey = ''
      newValue = ''
      await load()
    } catch (err) {
      newError = err instanceof AdminApiError ? err.message : 'Create failed'
    } finally {
      creating = false
    }
  }

  // ── row edit ──────────────────────────────────────────────────────
  let editingKey = $state<string | null>(null)
  let editValue = $state('')
  let editError = $state<string | null>(null)
  let editSaving = $state(false)

  function beginEdit(row: Row) {
    editingKey = row.key
    editValue =
      typeof row.value === 'string'
        ? row.value
        : JSON.stringify(row.value, null, 2)
    editError = null
  }
  function cancelEdit() {
    editingKey = null
    editValue = ''
    editError = null
  }
  async function saveEdit(row: Row) {
    if (!editingKey) return
    editError = null
    let parsedValue: unknown = editValue
    if (editValue.trim().startsWith('{') || editValue.trim().startsWith('[')) {
      try {
        parsedValue = JSON.parse(editValue)
      } catch {
        editError = 'Value looks like JSON but does not parse'
        return
      }
    }
    editSaving = true
    try {
      await adminApi.call(`/v1/admin/config/${row.key}`, {
        method: 'PUT',
        json: { value: parsedValue, updated_by: 'admin-web' },
      })
      cancelEdit()
      await load()
    } catch (err) {
      editError = err instanceof AdminApiError ? err.message : 'Save failed'
    } finally {
      editSaving = false
    }
  }

  async function deleteRow(row: Row) {
    if (!confirm(`Delete ${row.key}?\nThis is irreversible.`)) return
    try {
      await adminApi.call(`/v1/admin/config/${row.key}`, { method: 'DELETE' })
      if (editingKey === row.key) cancelEdit()
      await load()
    } catch (err) {
      listError = err instanceof AdminApiError ? err.message : 'Delete failed'
    }
  }

  // ── display helpers ──────────────────────────────────────────────
  const SECRET_HINT = /\.(api_key|secret|access_key|token|password|pepper)\b/i

  function looksSecret(key: string): boolean {
    return SECRET_HINT.test(key)
  }

  function preview(row: Row): string {
    if (looksSecret(row.key) && typeof row.value === 'string') {
      const v = row.value
      if (v.length <= 6) return '••••••'
      return `${v.slice(0, 3)}••••${v.slice(-3)}`
    }
    if (typeof row.value === 'string') return row.value
    return JSON.stringify(row.value)
  }
</script>

<PageHeader
  path={['Settings', 'Advanced']}
  title="Raw config keys"
  description="Direct CRUD against the config D1. Domain-specific pages above
              wrap this surface for the common cases — drop here when you need
              to inspect or change something they don't cover."
/>

<div class="stack">
  <SettingsCard
    title="Create a key"
    description={'Keys must follow {namespace}.{keyname} — lowercase letters, digits, and underscores; each segment starts with a letter. Values that start with { or [ are stored as JSON; everything else is a string.'}
  >
    <form onsubmit={createKey} class="new-form">
      <input
        type="text"
        placeholder="namespace.key"
        bind:value={newKey}
        spellcheck="false"
        autocapitalize="off"
        disabled={creating}
      />
      <textarea
        rows="2"
        placeholder="value (string, or JSON: object / array)"
        bind:value={newValue}
        spellcheck="false"
        disabled={creating}
      ></textarea>
      <div class="actions">
        <button
          type="submit"
          class="btn primary"
          disabled={!newKey || !newValue || creating}
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
      </div>
      {#if newError}
        <p class="msg error">{newError}</p>
      {/if}
    </form>
  </SettingsCard>

  <SettingsCard
    title="All keys"
    description="Every row currently in citizenry-config-db.config. Filter by
                 substring; values that look like secrets are masked until you
                 open the editor."
    status={badgeStatus}
    stacked
  >
    <div class="toolbar">
      <input
        type="search"
        placeholder="Filter by key…"
        bind:value={filter}
        spellcheck="false"
        autocapitalize="off"
      />
      <button type="button" class="btn ghost" onclick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
    </div>

    {#if listError}
      <p class="msg error">{listError}</p>
    {/if}

    {#if loading}
      <p class="muted">Loading…</p>
    {:else if visible.length === 0}
      <p class="empty">
        {filter ? 'No matches for that filter.' : 'No config rows yet.'}
      </p>
    {:else}
      <ul class="rows">
        {#each visible as row}
          <li class:open={editingKey === row.key}>
            <div class="row-head">
              <div class="row-meta">
                <code class="row-key">{row.key}</code>
                {#if looksSecret(row.key)}
                  <StatusBadge tone="info">secret</StatusBadge>
                {/if}
                <span class="row-updated">
                  updated {new Date(row.updated_at).toLocaleString()}
                  {#if row.updated_by}· {row.updated_by}{/if}
                </span>
              </div>
              <div class="row-actions">
                {#if editingKey === row.key}
                  <button
                    type="button"
                    class="btn ghost"
                    onclick={cancelEdit}
                    disabled={editSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn primary"
                    onclick={() => saveEdit(row)}
                    disabled={editSaving}
                  >
                    {editSaving ? 'Saving…' : 'Save'}
                  </button>
                {:else}
                  <button
                    type="button"
                    class="btn ghost"
                    onclick={() => beginEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="btn danger-ghost"
                    onclick={() => deleteRow(row)}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            </div>

            {#if editingKey === row.key}
              <textarea
                rows="4"
                bind:value={editValue}
                spellcheck="false"
                disabled={editSaving}
              ></textarea>
              {#if editError}
                <p class="msg error">{editError}</p>
              {/if}
            {:else}
              <code class="row-value">{preview(row)}</code>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </SettingsCard>
</div>

{#snippet badgeStatus()}
  {#if loading}
    <StatusBadge tone="muted">loading</StatusBadge>
  {:else}
    <StatusBadge tone="info">{rows.length} {rows.length === 1 ? 'row' : 'rows'}</StatusBadge>
  {/if}
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .new-form,
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }
  .toolbar {
    flex-direction: row;
    align-items: center;
    gap: $space-2;
  }

  input,
  textarea {
    width: 100%;
    padding: $space-2 $space-3;
    font-family: $font-mono;
    font-size: $font-size-sm;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--input);
    border-radius: $radius-md;
    resize: vertical;

    &:focus {
      outline: none;
      border-color: var(--ring);
      box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 18%, transparent);
    }
    &:disabled { opacity: 0.6; cursor: not-allowed; }
  }

  .toolbar input { flex: 1; }

  .actions {
    display: flex;
    gap: $space-2;
  }

  .btn {
    padding: $space-2 $space-3;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    border-radius: $radius-md;
    border: 1px solid transparent;
    cursor: pointer;
    transition: filter $transition-fast, background $transition-fast;
    white-space: nowrap;

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
  }

  .empty,
  .muted {
    padding: $space-4;
    background: var(--muted);
    border-radius: $radius-md;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    text-align: center;
  }
  .muted { background: transparent; padding: 0; text-align: left; }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: $radius-md;
    overflow: hidden;

    li {
      display: flex;
      flex-direction: column;
      gap: $space-2;
      padding: $space-3 $space-4;
      border-bottom: 1px solid var(--border);

      &:last-child { border-bottom: none; }
      &.open { background: var(--muted); }
    }
  }

  .row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-3;
    flex-wrap: wrap;
  }

  .row-meta {
    display: flex;
    align-items: center;
    gap: $space-2;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  .row-key {
    font-family: $font-mono;
    font-size: $font-size-sm;
    color: var(--foreground);
    font-weight: $font-weight-medium;
  }

  .row-updated {
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }

  .row-actions {
    display: flex;
    gap: $space-2;
  }

  .row-value {
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
    word-break: break-all;
    padding: $space-2;
    background: var(--background);
    border-radius: $radius-sm;
    border: 1px solid var(--border);
  }
</style>
