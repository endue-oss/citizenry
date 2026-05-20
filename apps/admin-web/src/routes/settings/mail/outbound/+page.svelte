<script lang="ts">
  // Outbound provider configuration. Five mail.outbound.* config keys
  // managed individually through the reusable SecretField component.
  // See ADR-2026-0005 for the priority chain and overall design.

  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
  import SecretField from '$lib/components/settings/SecretField.svelte'

  // Track latest stored values via the SecretField onChange callback,
  // so we can compute the effective sender without re-reading.
  let resend = $state<string | null>(null)
  let sesAccess = $state<string | null>(null)
  let sesSecret = $state<string | null>(null)

  const effective = $derived.by(() => {
    if (resend) return { tier: 2, name: 'Resend' }
    if (sesAccess && sesSecret) return { tier: 3, name: 'AWS SES' }
    return { tier: 4, name: 'Log-only' }
  })

  const tone = $derived(effective.tier === 4 ? 'warning' : 'success')
</script>

<PageHeader
  path={['Settings', 'Mail', 'Outbound']}
  title="Outbound providers"
  description="Configure how citizenry-mail dispatches outbound messages. Higher-priority
              providers override lower ones — set one and clear the rest to switch."
/>

<div class="stack">
  <SettingsCard
    title="Effective sender"
    description="The provider that wins the priority chain right now, based on the
                 credentials stored below. Cloudflare's [[send_email]] binding ranks
                 above all config-backed providers but isn't readable from here —
                 check apps/mail/wrangler.toml to confirm."
    status={badgeEffective}
  >
    <div class="effective">
      <span class="tier">priority #{effective.tier}</span>
      <strong>{effective.name}</strong>
    </div>
  </SettingsCard>

  <SettingsCard
    title="Resend"
    eyebrow="Priority 2"
    description="Works on any DNS — no Cloudflare-hosted mail domain required. Best
                 fit for fork-and-deploy adopters who already use Resend."
  >
    <SecretField
      configKey="mail.outbound.resend.api_key"
      label="API key"
      placeholder="re_…"
      secret
      hint="Get this from resend.com → API Keys. Stored verbatim in the config D1."
      onChange={(v) => (resend = v)}
    />
  </SettingsCard>

  <SettingsCard
    title="AWS SES"
    eyebrow="Priority 3"
    description="Best when the sending domain is already verified in SES. Both
                 access key and secret are required to activate the sender."
  >
    <div class="ses-grid">
      <SecretField
        configKey="mail.outbound.aws_ses.access_key_id"
        label="Access key id"
        placeholder="AKIA…"
        onChange={(v) => (sesAccess = v)}
      />
      <SecretField
        configKey="mail.outbound.aws_ses.secret_access_key"
        label="Secret access key"
        placeholder="…"
        secret
        onChange={(v) => (sesSecret = v)}
      />
      <SecretField
        configKey="mail.outbound.aws_ses.region"
        label="Region"
        placeholder="us-east-1"
        hint="Optional — defaults to us-east-1 when unset."
      />
      <SecretField
        configKey="mail.outbound.aws_ses.session_token"
        label="Session token"
        placeholder="STS temporary credentials"
        secret
        hint="Optional — only when using STS assumed-role / temporary credentials."
      />
    </div>
  </SettingsCard>

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
        <span>Provider chain</span>
        <code>CF MAIL → Resend → AWS SES → LogOnly</code>
      </li>
    </ul>
  </SettingsCard>
</div>

{#snippet badgeEffective()}
  <StatusBadge {tone} dot>{effective.name}</StatusBadge>
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .effective {
    display: flex;
    align-items: baseline;
    gap: $space-3;

    .tier {
      font-family: $font-mono;
      font-size: $font-size-xs;
      color: var(--muted-foreground);
    }
    strong {
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-tight;
    }
  }

  .ses-grid {
    display: flex;
    flex-direction: column;
    gap: $space-4;

    :global(> div + div) {
      padding-top: $space-4;
      border-top: 1px solid var(--border);
    }
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
