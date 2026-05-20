import { redirect } from '@sveltejs/kit'

// /settings/mail is a hub only — outbound and inbound are the two
// concrete sub-pages. Default to outbound because that's the side
// operators actively configure.
export const load = () => {
  throw redirect(307, '/settings/mail/outbound')
}
