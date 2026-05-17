<script lang="ts">
  import { page } from '$app/stores'

  type NavItem = { href: string; label: string; icon: string }

  const sections: { title: string; items: NavItem[] }[] = [
    {
      title: 'Overview',
      items: [
        { href: '/', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
      ],
    },
    {
      title: 'Identity',
      items: [
        { href: '/users', label: 'Users', icon: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM2 21a8 8 0 0 1 16 0' },
        { href: '/sessions', label: 'Sessions', icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
      ],
    },
    {
      title: 'Vault',
      items: [
        { href: '/secrets', label: 'Secrets', icon: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z' },
      ],
    },
    {
      title: 'System',
      items: [
        { href: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.66 15 1.7 1.7 0 0 0 3.1 14H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.66 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.66 1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.66a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.55.23 1 .68 1.22 1.22H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z' },
      ],
    },
  ]

  function isActive(href: string, pathname: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">C</span>
    <span class="brand-text">Citizenry</span>
    <span class="brand-tag">admin</span>
  </div>

  <nav class="nav">
    {#each sections as section}
      <div class="section">
        <div class="section-title">{section.title}</div>
        <ul>
          {#each section.items as item}
            <li>
              <a
                href={item.href}
                class="nav-link"
                class:active={isActive(item.href, $page.url.pathname)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/each}
  </nav>

  <div class="foot">
    <div class="foot-label">Endue Citizenry</div>
    <div class="foot-sub">v0.0.0</div>
  </div>
</aside>

<style lang="scss">
  @use '../styles/variables' as *;
  @use '../styles/mixins' as *;

  .sidebar {
    width: $sidebar-width;
    flex-shrink: 0;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: $space-5 $space-3;
    gap: $space-6;
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;

    @include below(md) {
      display: none;
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: 0 $space-2 $space-2 $space-2;

    .brand-mark {
      width: 28px;
      height: 28px;
      border-radius: $radius-md;
      background: linear-gradient(135deg, var(--logo-tone-light), var(--logo-tone-dark));
      color: var(--primary-foreground);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: $font-weight-bold;
      font-size: $font-size-sm;
      letter-spacing: 0;
    }

    .brand-text {
      font-weight: $font-weight-semibold;
      font-size: $font-size-base;
      color: var(--foreground);
    }

    .brand-tag {
      font-size: $font-size-xs;
      font-weight: $font-weight-medium;
      color: var(--muted-foreground);
      padding: 2px 6px;
      border-radius: $radius-sm;
      background: var(--muted);
    }
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: $space-5;
    flex: 1;
  }

  .section-title {
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;
    color: var(--muted-foreground);
    padding: 0 $space-2 $space-2 $space-2;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .nav-link {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: $space-2 $space-2;
    border-radius: $radius-md;
    font-size: $font-size-sm;
    color: var(--muted-foreground);
    transition: background-color $transition-fast, color $transition-fast;

    &:hover {
      background: var(--accent);
      color: var(--foreground);
    }

    &.active {
      background: var(--accent);
      color: var(--foreground);
      font-weight: $font-weight-medium;
    }
  }

  .foot {
    padding: $space-3 $space-2;
    border-top: 1px solid var(--border);

    .foot-label {
      font-size: $font-size-xs;
      color: var(--foreground);
      font-weight: $font-weight-medium;
    }

    .foot-sub {
      font-size: $font-size-xs;
      color: var(--muted-foreground);
      font-family: $font-mono;
    }
  }
</style>
