<script lang="ts">
  // GitHub/GitLab-style settings shell: sticky sub-sidebar on the left
  // with grouped sections (Account / Identity / Mail / Advanced), a
  // generous-padded main column on the right. Mobile collapses the
  // sidebar above the content.

  import { page } from '$app/stores'

  let { children } = $props()

  type Item = { href: string; label: string }
  type Group = { title: string; items: Item[] }

  const groups: Group[] = [
    {
      title: 'Account',
      items: [{ href: '/settings/account', label: 'Profile & security' }],
    },
    {
      title: 'Identity',
      items: [{ href: '/settings/identity', label: 'Domain allow-list' }],
    },
    {
      title: 'Mail',
      items: [
        { href: '/settings/mail/outbound', label: 'Outbound providers' },
        { href: '/settings/mail/inbound', label: 'Inbound (Email Routing)' },
      ],
    },
    {
      title: 'Advanced',
      items: [{ href: '/settings/advanced', label: 'Raw config keys' }],
    },
  ]

  function isActive(href: string, pathname: string) {
    return pathname === href || pathname.startsWith(href + '/')
  }
</script>

<div class="shell">
  <aside class="subnav" aria-label="Settings sections">
    <div class="brand">
      <span class="eyebrow">Settings</span>
      <h2>Citizenry</h2>
      <p class="muted">Administrative controls for this instance.</p>
    </div>

    <nav>
      {#each groups as group}
        <div class="group">
          <span class="group-title">{group.title}</span>
          <ul>
            {#each group.items as item}
              <li>
                <a
                  href={item.href}
                  class:active={isActive(item.href, $page.url.pathname)}
                >
                  {item.label}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </nav>
  </aside>

  <section class="main">
    <div class="content">
      {@render children?.()}
    </div>
  </section>
</div>

<style lang="scss">
  @use '$lib/styles/variables' as *;
  @use '$lib/styles/mixins' as *;

  .shell {
    display: grid;
    grid-template-columns: 296px 1fr;
    min-height: 100dvh;

    @include below(lg) { grid-template-columns: 244px 1fr; }
    @include below(md) { grid-template-columns: 1fr; }
  }

  .subnav {
    border-right: 1px solid var(--border);
    background: var(--card);
    color: var(--card-foreground);
    padding: $space-6 $space-4;
    display: flex;
    flex-direction: column;
    gap: $space-5;
    overflow-y: auto;
    position: sticky;
    top: 0;
    height: 100dvh;

    @include below(md) {
      position: static;
      height: auto;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }

  .brand {
    padding: 0 $space-2;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .eyebrow {
      font-size: $font-size-xs;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted-foreground);
      font-weight: $font-weight-medium;
    }
    h2 {
      font-size: $font-size-lg;
      font-weight: $font-weight-semibold;
      letter-spacing: $letter-spacing-tight;
    }
    .muted {
      margin-top: 2px;
      font-size: $font-size-xs;
      color: var(--muted-foreground);
      line-height: $line-height-normal;
    }
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: $space-4;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: $space-1;
  }

  .group-title {
    padding: 0 $space-2;
    font-size: 11px;
    font-weight: $font-weight-semibold;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted-foreground);
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  a {
    display: block;
    padding: 6px $space-3;
    border-radius: $radius-md;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    text-decoration: none;
    color: var(--muted-foreground);
    transition: background $transition-fast, color $transition-fast;

    &:hover {
      background: var(--accent);
      color: var(--foreground);
    }

    &.active {
      background: var(--accent);
      color: var(--foreground);
    }
  }

  .main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--background);
  }

  .content {
    flex: 1;
    padding: $space-6 $space-8;
    max-width: 960px;
    width: 100%;
    margin: 0 auto;

    @include below(md) {
      padding: $space-5 $space-4;
    }
  }
</style>
