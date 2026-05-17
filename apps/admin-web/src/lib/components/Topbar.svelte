<script lang="ts">
  import ThemeToggle from './ThemeToggle.svelte'

  let { title = 'Dashboard' }: { title?: string } = $props()
</script>

<header class="topbar">
  <div class="left">
    <h1 class="title">{title}</h1>
  </div>
  <div class="right">
    <div class="search">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input type="search" placeholder="Search…" aria-label="Search" />
    </div>
    <ThemeToggle />
    <div class="avatar" aria-label="Admin">A</div>
  </div>
</header>

<style lang="scss">
  @use '../styles/variables' as *;

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-4;
    height: $header-height;
    padding: 0 $space-6;
    border-bottom: 1px solid var(--border);
    background: var(--background);
    position: sticky;
    top: 0;
    z-index: $z-nav;
  }

  .title {
    font-size: $font-size-lg;
    font-weight: $font-weight-semibold;
    color: var(--foreground);
  }

  .right {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  .search {
    display: flex;
    align-items: center;
    gap: $space-2;
    padding: 0 $space-3;
    height: 32px;
    width: 220px;
    background: var(--muted);
    border-radius: $radius-md;
    color: var(--muted-foreground);

    input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      font-size: $font-size-sm;
      color: var(--foreground);
      font-family: inherit;

      &::placeholder { color: var(--muted-foreground); }
    }
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: $radius-full;
    background: var(--primary);
    color: var(--primary-foreground);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
  }
</style>
