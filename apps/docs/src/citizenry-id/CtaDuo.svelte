<script module lang="ts">
  // Module-scoped state — every <CtaDuo> instance shares the same
  // mouse-active flag, and the global mousemove listener attaches once.
  let humanActive = $state(false)
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let listenerAttached = false

  function ensureListener() {
    if (listenerAttached || typeof window === 'undefined') return
    listenerAttached = true
    window.addEventListener(
      'mousemove',
      () => {
        if (!humanActive) humanActive = true
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          humanActive = false
        }, 1500)
      },
      { passive: true },
    )
  }

  export function isHumanActive() {
    return humanActive
  }
</script>

<script lang="ts">
  import './CtaDuo.scss'
  import { path } from './router.svelte'

  type Props = {
    humanHref?: string
    agentHref?: string
    size?: 'md' | 'sm'
    short?: boolean
  }
  let {
    humanHref = '#why-01',
    agentHref = '/llms.txt',
    size = 'md',
    short = false,
  }: Props = $props()

  // `humanHref` targets a section that only exists on the home page
  // (e.g. `#why-01`). On sub-pages, prepend `/` so the browser routes to
  // the root and then resolves the anchor.
  const resolvedHumanHref = $derived(
    humanHref.startsWith('#') && path.value !== '/'
      ? `/${humanHref}`
      : humanHref,
  )

  $effect(() => {
    ensureListener()
  })
</script>

<div class="cta-duo cta-duo--{size}" role="group" aria-label="Choose your kind">
  <span class="cta-duo__paren cta-duo__paren--l" aria-hidden="true">(</span>
  <a
    class="cta-duo__half cta-duo__half--human"
    class:is-rainbow={humanActive}
    href={resolvedHumanHref}
  >
    {short ? 'Human?' : 'Are you a human?'}
  </a>
  <span class="cta-duo__sep" aria-hidden="true">/</span>
  <a
    class="cta-duo__half cta-duo__half--agent"
    class:is-rainbow={!humanActive}
    href={agentHref}
  >
    {short ? 'Agent?' : 'Are you an agent?'}
  </a>
  <span class="cta-duo__paren cta-duo__paren--r" aria-hidden="true">)</span>
</div>
