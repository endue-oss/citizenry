// Tiny client-side router for the SPA.
//
// Public surface:
//   path.value   — reactive current pathname (read in templates)
//   navigate(to) — pushState + scroll to top
//
// A document-level click interceptor turns any same-origin <a href="/..."> into
// a pushState navigation, so authoring stays plain HTML — no router-link.

let _path = $state(typeof window !== 'undefined' ? window.location.pathname : '/')

export const path = {
  get value() {
    return _path
  },
}

export function navigate(to: string) {
  if (to === _path) return
  history.pushState(null, '', to)
  _path = to
  window.scrollTo({ top: 0 })
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    _path = window.location.pathname
  })

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return

    const a = (e.target as HTMLElement | null)?.closest('a') as HTMLAnchorElement | null
    if (!a) return
    if (a.target === '_blank' || a.hasAttribute('download')) return
    if (a.origin !== location.origin) return

    const href = a.getAttribute('href') ?? ''
    // Skip hash links (in-page anchors) and protocol-relative URLs.
    if (!href.startsWith('/') || href.startsWith('//')) return
    if (href.startsWith('/#')) return

    e.preventDefault()
    navigate(href)
  })
}
