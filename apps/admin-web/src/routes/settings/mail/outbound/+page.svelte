<script lang="ts">
  // Outbound provider configuration.
  //
  //   1. Priority — drag-and-drop (or ↑/↓) ordering of the credentialed
  //      providers, persisted to the `mail.outbound.priority` config key.
  //      citizenry-mail tries them top-to-bottom and falls back to the
  //      next on failure; Log-only is the always-on terminal sink.
  //   2. Per-provider credentials via the reusable SecretField component.
  //
  // See ADR-2026-0005 for the priority chain and overall design.

  import { onMount } from 'svelte'
  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import SecretField from '$lib/components/settings/SecretField.svelte'
  import ProviderCredentials from '$lib/components/settings/ProviderCredentials.svelte'
  import { adminApi, AdminApiError } from '$lib/api'

  const PRIORITY_KEY = 'mail.outbound.priority'

  type ProviderId = 'cloudflare' | 'resend' | 'aws_ses' | 'google'
  const DEFAULT_ORDER: ProviderId[] = ['cloudflare', 'resend', 'aws_ses', 'google']
  const KNOWN = new Set<string>(DEFAULT_ORDER)

  const META: Record<ProviderId, { name: string; hint: string }> = {
    cloudflare: {
      name: 'Cloudflare Email',
      hint: 'Native [[send_email]] binding — configured in apps/mail/wrangler.toml.',
    },
    resend: { name: 'Resend', hint: 'Activated by the API key below.' },
    aws_ses: { name: 'AWS SES', hint: 'Activated by the access key + secret below.' },
    google: { name: 'Google Workspace', hint: 'Gmail API via a service account below.' },
  }

  // Field definitions for the grouped credential editors.
  const SES_FIELDS = [
    { key: 'mail.outbound.aws_ses.access_key_id', label: 'Access key id', placeholder: 'AKIA…' },
    { key: 'mail.outbound.aws_ses.secret_access_key', label: 'Secret access key', placeholder: '…', secret: true },
    { key: 'mail.outbound.aws_ses.region', label: 'Region', placeholder: 'us-east-1', hint: 'Optional — defaults to us-east-1 when unset.' },
    { key: 'mail.outbound.aws_ses.session_token', label: 'Session token', placeholder: 'STS temporary credentials', secret: true, hint: 'Optional — only for STS assumed-role / temporary credentials.' },
  ]
  const SES_REQUIRED = [
    'mail.outbound.aws_ses.access_key_id',
    'mail.outbound.aws_ses.secret_access_key',
  ]
  const GOOGLE_FIELDS = [
    { key: 'mail.outbound.google.client_email', label: 'Client email', placeholder: 'name@project.iam.gserviceaccount.com', hint: 'Service account address (the JWT issuer).' },
    { key: 'mail.outbound.google.private_key', label: 'Private key', placeholder: '-----BEGIN PRIVATE KEY-----…', secret: true, hint: 'Service account PEM key. Paste the private_key field from the JSON.' },
    { key: 'mail.outbound.google.sender', label: 'Sender', placeholder: 'noreply@your-domain.com', hint: 'Workspace user to send as — must match the domain-wide delegation.' },
  ]
  const GOOGLE_REQUIRED = GOOGLE_FIELDS.map((f) => f.key)

  // Credential state — `resend` via SecretField onChange; SES/Google
  // active flags via the grouped editors' onState callback.
  let resend = $state<string | null>(null)
  let sesActive = $state(false)
  let googleActive = $state(false)

  // Which provider panels are expanded.
  let openResend = $state(false)
  let openSes = $state(false)
  let openGoogle = $state(false)

  /** null = unknown (Cloudflare binding isn't readable from the browser). */
  function providerActive(id: ProviderId): boolean | null {
    if (id === 'resend') return !!resend
    if (id === 'aws_ses') return sesActive
    if (id === 'google') return googleActive
    return null // cloudflare
  }

  // ── priority ordering ──────────────────────────────────────────────

  let order = $state<ProviderId[]>([...DEFAULT_ORDER])
  let savedOrder = $state<ProviderId[]>([...DEFAULT_ORDER])
  let loading = $state(true)
  let applying = $state(false)
  let applyError = $state<string | null>(null)
  let flash = $state(false)
  let dragId = $state<ProviderId | null>(null)

  const dirty = $derived(JSON.stringify(order) !== JSON.stringify(savedOrder))

  /** First provider we can confirm is credentialed (Cloudflare excluded). */
  const firstReadableActive = $derived(
    order.find((id) => providerActive(id) === true) ?? null,
  )
  /** Does an unknown-state Cloudflare sit ahead of the first live provider? */
  const cloudflareMayPreempt = $derived.by(() => {
    for (const id of order) {
      if (id === 'cloudflare') return true
      if (providerActive(id) === true) return false
    }
    return false
  })

  function sanitize(raw: unknown): ProviderId[] {
    const next: ProviderId[] = []
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (typeof v === 'string' && KNOWN.has(v) && !next.includes(v as ProviderId)) {
          next.push(v as ProviderId)
        }
      }
    }
    for (const id of DEFAULT_ORDER) if (!next.includes(id)) next.push(id)
    return next
  }

  onMount(async () => {
    try {
      const entry = await adminApi
        .call<{ value: unknown }>(`/v1/admin/config/${PRIORITY_KEY}`)
        .catch((err) => {
          if (err instanceof AdminApiError && err.status === 404) return null
          throw err
        })
      const loaded = sanitize(entry?.value)
      order = loaded
      savedOrder = [...loaded]
    } catch (err) {
      applyError = err instanceof AdminApiError ? err.message : 'Failed to load priority'
    } finally {
      loading = false
    }
  })

  function move(id: ProviderId, to: number) {
    const from = order.indexOf(id)
    if (from < 0 || to < 0 || to >= order.length || from === to) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, id)
    order = next
    flash = false
  }

  function onDragStart(id: ProviderId) {
    dragId = id
  }
  function onDragOver(event: DragEvent, overId: ProviderId) {
    event.preventDefault()
    if (!dragId || dragId === overId) return
    move(dragId, order.indexOf(overId))
  }
  function onDragEnd() {
    dragId = null
  }

  async function apply() {
    if (applying || !dirty) return
    applying = true
    applyError = null
    flash = false
    try {
      await adminApi.call(`/v1/admin/config/${PRIORITY_KEY}`, {
        method: 'PUT',
        json: { value: order, updated_by: 'admin-web' },
      })
      savedOrder = [...order]
      flash = true
    } catch (err) {
      applyError = err instanceof AdminApiError ? err.message : 'Apply failed'
    } finally {
      applying = false
    }
  }

  function resetOrder() {
    order = [...savedOrder]
    applyError = null
    flash = false
  }
</script>

<PageHeader
  path={['Settings', 'Mail', 'Outbound']}
  title="Outbound providers"
  description="Configure how citizenry-mail dispatches outbound messages. Drag to set
              the priority order — a send tries each provider top-to-bottom and falls
              back to the next when one fails."
/>

<div class="stack">
  <SettingsCard
    title="Provider priority"
    description="Drag a row (or use ↑/↓) to reorder. On send, citizenry-mail walks
                 this list and falls back to the next provider whenever one errors.
                 Log-only is the always-on final fallback and never fails."
    status={badgePriority}
  >
    {#if loading}
      <p class="muted">Loading…</p>
    {:else}
      <ul class="rank">
        {#each order as id, i (id)}
          {@const active = providerActive(id)}
          <li
            class="row"
            class:dragging={dragId === id}
            draggable="true"
            ondragstart={() => onDragStart(id)}
            ondragover={(e) => onDragOver(e, id)}
            ondragend={onDragEnd}
          >
            <span class="grip" aria-hidden="true">⠿</span>
            <span class="pos">#{i + 1}</span>
            <span class="body">
              <span class="name">{META[id].name}</span>
              <span class="hint">{META[id].hint}</span>
            </span>
            <span class="state">
              {#if active === true}
                <StatusBadge tone="success" dot>active</StatusBadge>
              {:else if active === false}
                <StatusBadge tone="muted">not set</StatusBadge>
              {:else}
                <StatusBadge tone="info">binding</StatusBadge>
              {/if}
            </span>
            <span class="nudge">
              <button
                type="button"
                aria-label="Move {META[id].name} up"
                disabled={i === 0 || applying}
                onclick={() => move(id, i - 1)}
              >↑</button>
              <button
                type="button"
                aria-label="Move {META[id].name} down"
                disabled={i === order.length - 1 || applying}
                onclick={() => move(id, i + 1)}
              >↓</button>
            </span>
          </li>
        {/each}
        <li class="row terminal">
          <span class="grip" aria-hidden="true">·</span>
          <span class="pos">last</span>
          <span class="body">
            <span class="name">Log-only</span>
            <span class="hint">Always-on fallback — records to Worker logs, never fails.</span>
          </span>
          <span class="state"><StatusBadge tone="muted">fallback</StatusBadge></span>
          <span class="nudge"></span>
        </li>
      </ul>

      <p class="muted small foot">
        Effective now:
        {#if cloudflareMayPreempt}
          <strong>Cloudflare Email</strong> if its binding is set, otherwise
          <strong>{firstReadableActive ? META[firstReadableActive].name : 'Log-only'}</strong>
        {:else}
          <strong>{firstReadableActive ? META[firstReadableActive].name : 'Log-only'}</strong>
        {/if}
        · changes take effect within the 5-minute config cache.
      </p>

      <div class="actions">
        {#if applyError}
          <p class="msg error">{applyError}</p>
        {:else if flash}
          <p class="msg ok">Priority saved.</p>
        {/if}
        <span class="spacer"></span>
        {#if dirty}
          <button type="button" class="btn ghost" onclick={resetOrder} disabled={applying}>
            Reset
          </button>
        {/if}
        <button type="button" class="btn primary" onclick={apply} disabled={!dirty || applying}>
          {applying ? 'Applying…' : 'Apply'}
        </button>
      </div>
    {/if}
  </SettingsCard>

  <section class="provider-box">
    <header class="provider-head">
      <h3 class="section-label">Provider</h3>
      <p class="section-desc">
        Expand a provider to set or rotate its credentials. Activating one makes
        it eligible in the priority chain above.
      </p>
    </header>

    <div class="folds">
      <div class="fold" class:open={openResend}>
        <button
          type="button"
          class="fold-head"
          aria-expanded={openResend}
          aria-controls="fold-resend"
          onclick={() => (openResend = !openResend)}
        >
          {@render chevron()}
          <span class="fold-text">
            <span class="fold-name">Resend</span>
            <span class="fold-sub">
              Works on any DNS — no Cloudflare-hosted mail domain required. Best
              fit for fork-and-deploy adopters who already use Resend.
            </span>
          </span>
          {@render stateBadge(!!resend)}
        </button>
        <div class="fold-bodywrap" id="fold-resend" inert={!openResend}>
          <div class="fold-body">
            <div class="fold-inner">
              <SecretField
                configKey="mail.outbound.resend.api_key"
                label="API key"
                placeholder="re_…"
                secret
                hideStatus
                hint="Get this from resend.com → API Keys. Stored verbatim in the config D1."
                onChange={(v) => (resend = v)}
              />
            </div>
          </div>
        </div>
      </div>

      <div class="fold" class:open={openSes}>
        <button
          type="button"
          class="fold-head"
          aria-expanded={openSes}
          aria-controls="fold-ses"
          onclick={() => (openSes = !openSes)}
        >
          {@render chevron()}
          <span class="fold-text">
            <span class="fold-name">AWS SES</span>
            <span class="fold-sub">
              Best when the sending domain is already verified in SES. Both access
              key and secret are required to activate the sender.
            </span>
          </span>
          {@render stateBadge(sesActive)}
        </button>
        <div class="fold-bodywrap" id="fold-ses" inert={!openSes}>
          <div class="fold-body">
            <div class="fold-inner">
              <ProviderCredentials
                fields={SES_FIELDS}
                requiredKeys={SES_REQUIRED}
                saveLabel="Save SES credentials"
                onState={(a) => (sesActive = a)}
              />
            </div>
          </div>
        </div>
      </div>

      <div class="fold" class:open={openGoogle}>
        <button
          type="button"
          class="fold-head"
          aria-expanded={openGoogle}
          aria-controls="fold-google"
          onclick={() => (openGoogle = !openGoogle)}
        >
          {@render chevron()}
          <span class="fold-text">
            <span class="fold-name">Google Workspace</span>
            <span class="fold-sub">
              Sends through the Gmail API with a service account (domain-wide
              delegation). No interactive Google login — just the keys below.
            </span>
          </span>
          {@render stateBadge(googleActive)}
        </button>
        <div class="fold-bodywrap" id="fold-google" inert={!openGoogle}>
          <div class="fold-body">
            <div class="fold-inner">
              <ProviderCredentials
                fields={GOOGLE_FIELDS}
                requiredKeys={GOOGLE_REQUIRED}
                saveLabel="Save Google credentials"
                onState={(a) => (googleActive = a)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <SettingsCard
    title="Propagation & audit"
    description="How changes here actually reach the mail Worker, and where to verify
                 that outbound is doing what you expect."
    stacked
  >
    <ul class="kv">
      <li>
        <span>Cache</span>
        <code>packages/config / withTtlCache (5 min, colo-local)</code>
      </li>
      <li>
        <span>Audit table</span>
        <code>mail_outbound_log (citizenry-mail-db)</code>
      </li>
      <li>
        <span>Priority key</span>
        <code>{PRIORITY_KEY}</code>
      </li>
    </ul>
  </SettingsCard>
</div>

{#snippet badgePriority()}
  {#if loading}
    <StatusBadge tone="muted">loading</StatusBadge>
  {:else if dirty}
    <StatusBadge tone="warning">unsaved</StatusBadge>
  {:else}
    <StatusBadge tone="success" dot>saved</StatusBadge>
  {/if}
{/snippet}

{#snippet stateBadge(active: boolean)}
  {#if active}
    <StatusBadge tone="success" dot>active</StatusBadge>
  {:else}
    <StatusBadge tone="muted">not set</StatusBadge>
  {/if}
{/snippet}

{#snippet chevron()}
  <svg
    class="chev"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 6 15 12 9 18" />
  </svg>
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .rank {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }

  .row {
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-3;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: $radius-md;
    cursor: grab;
    transition: border-color $transition-fast, background $transition-fast,
      opacity $transition-fast;

    &:hover { border-color: var(--ring); }
    &.dragging { opacity: 0.55; cursor: grabbing; }

    &.terminal {
      cursor: default;
      background: transparent;
      border-style: dashed;
      opacity: 0.8;
      &:hover { border-color: var(--border); }
    }
  }

  .grip {
    color: var(--muted-foreground);
    font-size: $font-size-base;
    line-height: 1;
    user-select: none;
  }
  .pos {
    min-width: 2.4em;
    font-family: $font-mono;
    font-size: $font-size-xs;
    color: var(--muted-foreground);
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    .name { font-weight: $font-weight-semibold; }
    .hint { font-size: $font-size-xs; color: var(--muted-foreground); }
  }
  .state { flex-shrink: 0; }

  .nudge {
    display: inline-flex;
    gap: 4px;

    button {
      width: 24px;
      height: 24px;
      border-radius: $radius-sm;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--foreground);
      cursor: pointer;
      line-height: 1;

      &:hover:not(:disabled) { background: var(--accent); }
      &:disabled { opacity: 0.35; cursor: not-allowed; }
    }
  }

  .actions {
    display: flex;
    align-items: center;
    gap: $space-3;
    margin-top: $space-4;

    .spacer { flex: 1; }
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
    &.error { color: var(--destructive); }
    &.ok    { color: var(--success); }
  }

  // ── provider folding section ───────────────────────────────────────
  .provider-box {
    background: var(--card);
    color: var(--card-foreground);
    border: 1px solid var(--border);
    border-radius: $radius-lg;
    padding: $space-3 $space-5 $space-4;
  }
  .provider-head {
    padding: $space-2 0;

    .section-label {
      margin: 0;
      font-size: $font-size-xs;
      font-weight: $font-weight-semibold;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted-foreground);
    }
    .section-desc {
      margin: $space-1 0 0;
      font-size: $font-size-xs;
      color: var(--muted-foreground);
    }
  }

  .folds {
    display: flex;
    flex-direction: column;
  }
  .fold + .fold {
    border-top: 1px solid var(--border);
  }

  .fold-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: $space-3;
    padding: $space-3 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;

    &:hover .fold-name { color: var(--primary); }
  }

  .chev {
    flex-shrink: 0;
    color: var(--muted-foreground);
    transition: transform 240ms ease, color 240ms ease;
  }
  .fold.open .chev {
    transform: rotate(90deg);
    color: var(--primary);
  }

  .fold-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    .fold-name {
      font-weight: $font-weight-semibold;
      transition: color $transition-fast;
    }
    .fold-sub { font-size: $font-size-xs; color: var(--muted-foreground); }
  }

  // Smooth height fold via animatable grid track. Content stays mounted
  // (so the status badges stay accurate) but is clipped when collapsed.
  .fold-bodywrap {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 240ms ease;
  }
  .fold.open .fold-bodywrap {
    grid-template-rows: 1fr;
  }
  .fold-body {
    overflow: hidden;
    min-height: 0;
  }
  .fold-inner {
    // Indent to line up with the header text — chevron width (20px) plus
    // the head's gap, so the body sits under the provider name.
    padding-left: calc(20px + #{$space-3});
    padding-bottom: $space-4;
  }

  @media (prefers-reduced-motion: reduce) {
    .chev,
    .fold-bodywrap {
      transition: none;
    }
  }

  // (Grouped credential inputs now live in ProviderCredentials.svelte.)

  .muted {
    color: var(--muted-foreground);
    font-size: $font-size-sm;
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
