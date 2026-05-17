// Runtime ID minter for the email Worker.
//
// v1 uses `crypto.randomUUID()` for the random portion — not a real Crockford
// Base32 ULID, but stable, unique, and works in the Workers runtime without a
// dependency. Replace with `ulidx` (or equivalent) once the broader codebase
// commits to a ULID lib (see packages/identity/src/ids.ts).

import { ID_PREFIX, type IdKind } from '@citizenry/email'

export function mintId(kind: IdKind): string {
  const random = crypto.randomUUID().replace(/-/g, '')
  return `${ID_PREFIX[kind]}_${random}`
}
