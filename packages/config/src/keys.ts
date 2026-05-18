// Config key naming convention.
//
// Every key MUST follow `{namespace}.{keyname}` so the table doubles as a
// flat namespace-segmented store ("admin.password", "mail.resend_api_key",
// "enrollment.pepper"). Reads stay permissive (you can fetch any string)
// but writes go through `assertConfigKey` so we never end up with stray
// flat keys mixed in with namespaced ones.
//
// Allowed segments are lowercase letters, digits, and underscores; each
// segment must start with a letter. Multi-level keynames (e.g.
// "mail.outbound.resend_api_key") are intentionally allowed — namespaces
// nest naturally that way.

const SEGMENT = '[a-z][a-z0-9_]*'
const KEY_RE = new RegExp(`^${SEGMENT}\\.${SEGMENT}(?:\\.${SEGMENT})*$`)

export class InvalidConfigKeyError extends Error {
  constructor(public readonly key: string) {
    super(
      `invalid config key "${key}": expected {namespace}.{keyname} ` +
        `(lowercase a-z/0-9/_; each segment starts with a letter)`,
    )
    this.name = 'InvalidConfigKeyError'
  }
}

export const isValidConfigKey = (key: string): boolean => KEY_RE.test(key)

export function assertConfigKey(key: string): void {
  if (!isValidConfigKey(key)) throw new InvalidConfigKeyError(key)
}
