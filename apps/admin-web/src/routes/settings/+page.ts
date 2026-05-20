import { redirect } from '@sveltejs/kit'

// /settings is a landing slot only — operators should always be one
// click into a concrete section. Default to Account, the first item
// in the sub-sidebar.
export const load = () => {
  throw redirect(307, '/settings/account')
}
