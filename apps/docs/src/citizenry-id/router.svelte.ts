// Path-reactive store, scoped down for the docs site.
//
// citizenry.id is a Svelte SPA with a global click interceptor that
// turns every same-origin `<a href="/...">` into pushState — perfect
// there, broken here. The docs site is an Astro SSG: every internal
// link must trigger a real browser navigation so the next HTML page
// renders. We keep `path.value` reactive (it's read by Header.svelte
// for product-subnav highlighting) but drop the click interceptor.
//
// `navigate(to)` still exists for the Svelte components that import
// it (CtaDuo etc.); it now performs a full-page assignment instead
// of a pushState so the new SSG page actually loads.

let _path = $state(typeof window !== 'undefined' ? window.location.pathname : '/')

export const path = {
  get value() {
    return _path
  },
}

export function navigate(to: string) {
  if (to === _path) return
  if (typeof window === 'undefined') return
  window.location.assign(to)
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    _path = window.location.pathname
  })
}
