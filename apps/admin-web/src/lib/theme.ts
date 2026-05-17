import { browser } from '$app/environment'
import { writable } from 'svelte/store'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'citizenry-admin-theme'

function readInitial(): Theme {
  if (!browser) return 'dark'
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

function apply(theme: Theme) {
  if (!browser) return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(STORAGE_KEY, theme)
}

export const theme = writable<Theme>(readInitial())

theme.subscribe(apply)

export function toggleTheme() {
  theme.update((t) => (t === 'dark' ? 'light' : 'dark'))
}
