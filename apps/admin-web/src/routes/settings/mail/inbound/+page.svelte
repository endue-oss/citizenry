<script lang="ts">
  // Mail inbound — informational page. CF Email Routing is operator-
  // configured in the Cloudflare dashboard, not via admin-api, so this
  // page mostly documents the setup and pointers to verify it works.

  import PageHeader from '$lib/components/settings/PageHeader.svelte'
  import SettingsCard from '$lib/components/settings/SettingsCard.svelte'
  import StatusBadge from '$lib/components/settings/StatusBadge.svelte'
</script>

<PageHeader
  path={['Settings', 'Mail', 'Inbound']}
  title="Inbound mail"
  description="Inbound mail is routed by Cloudflare Email Routing → the citizenry-mail
              Worker. Routing rules live in the Cloudflare dashboard rather than the
              config D1; this page documents the expected setup and where to verify."
/>

<div class="stack">
  <SettingsCard
    title="Setup steps"
    description="One-time configuration in the Cloudflare dashboard for the zone
                 matching MAIL_DOMAIN. Skipping these steps leaves inbound silent
                 (no errors, just no delivery)."
    status={badgeManual}
  >
    <ol class="steps">
      <li>
        <strong>Open the zone</strong>
        <span>Dashboard → your MAIL_DOMAIN zone → <em>Email → Email Routing</em>.</span>
      </li>
      <li>
        <strong>Enable Email Routing</strong>
        <span>Add the three MX records Cloudflare auto-suggests.</span>
      </li>
      <li>
        <strong>Add a catch-all route</strong>
        <span>
          Match <code>*@&lt;MAIL_DOMAIN&gt;</code> → <em>Send to a Worker</em> →
          select <code>citizenry-mail</code>.
        </span>
      </li>
      <li>
        <strong>Send a test message</strong>
        <span>
          Use a sender outside the zone. The Worker's <code>email()</code>
          handler resolves the local-part against
          <code>identity.agent.slug</code>; unknown recipients are dropped
          silently but logged in <code>mail_inbound_log</code>.
        </span>
      </li>
    </ol>
  </SettingsCard>

  <SettingsCard
    title="Verification"
    description="Where to look after sending a test message to confirm the chain is
                 working end-to-end."
    stacked
  >
    <ul class="kv">
      <li>
        <span>Worker logs</span>
        <code>wrangler tail citizenry-mail</code>
      </li>
      <li>
        <span>Inbound audit</span>
        <code>wrangler d1 execute citizenry-mail-db --remote --command="SELECT * FROM mail_inbound_log ORDER BY received_at DESC LIMIT 20;"</code>
      </li>
      <li>
        <span>Mail row</span>
        <code>SELECT mail_id, account_id, subject FROM mail WHERE direction='inbound' ORDER BY received_at DESC LIMIT 10;</code>
      </li>
    </ul>
  </SettingsCard>

  <SettingsCard
    title="Why no controls here?"
    description="Cloudflare Email Routing is operator infrastructure (DNS, routes,
                 sender allowlists); we don't proxy those through admin-api. The
                 config D1 only holds runtime settings that the data plane reads at
                 request time."
    stacked
  >
    <p class="prose">
      If you need a single pane of glass eventually, the route would be a
      thin Worker that talks to the Cloudflare API on the operator's behalf
      and surfaces routing rules here. That's an explicit future PR — not
      something to fork into this page lightly.
    </p>
  </SettingsCard>
</div>

{#snippet badgeManual()}
  <StatusBadge tone="info">manual</StatusBadge>
{/snippet}

<style lang="scss">
  @use '$lib/styles/variables' as *;

  .stack {
    display: flex;
    flex-direction: column;
    gap: $space-5;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: step;
    display: flex;
    flex-direction: column;
    gap: $space-3;

    li {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: $space-3;
      align-items: baseline;
      counter-increment: step;
      padding: $space-2 0;
      border-bottom: 1px solid var(--border);
      font-size: $font-size-sm;

      &:last-child { border-bottom: none; }

      &::before {
        content: counter(step);
        display: inline-grid;
        place-items: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--muted);
        color: var(--muted-foreground);
        font-family: $font-mono;
        font-size: $font-size-xs;
        font-weight: $font-weight-semibold;
        grid-row: 1 / 3;
      }

      strong {
        font-size: $font-size-sm;
        font-weight: $font-weight-semibold;
      }
      span {
        color: var(--muted-foreground);
        font-size: $font-size-xs;
        line-height: $line-height-relaxed;

        code {
          font-family: $font-mono;
          background: var(--muted);
          padding: 1px 4px;
          border-radius: $radius-sm;
          color: var(--foreground);
        }
        em {
          font-style: normal;
          color: var(--foreground);
        }
      }
    }
  }

  .kv {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;

    li {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: $space-3;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: $font-size-sm;

      &:last-child { border-bottom: none; }
      span { color: var(--muted-foreground); }
      code {
        font-family: $font-mono;
        font-size: $font-size-xs;
        color: var(--foreground);
        word-break: break-all;
      }
    }
  }

  .prose {
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    line-height: $line-height-relaxed;
    max-width: 64ch;
  }
</style>
