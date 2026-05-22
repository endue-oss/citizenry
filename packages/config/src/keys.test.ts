import { describe, expect, it } from 'vitest'
import { assertConfigKey, isValidConfigKey, InvalidConfigKeyError } from './keys'

describe('config key convention', () => {
  it('accepts {namespace}.{keyname} pairs', () => {
    for (const key of [
      'admin.password',
      'mail.resend_api_key',
      'identity.pepper',
      'a1.b2',
      'mail.outbound.resend_api_key',
    ]) {
      expect(isValidConfigKey(key)).toBe(true)
    }
  })

  it('rejects flat keys, empty segments, and non-conforming chars', () => {
    for (const key of [
      'flat',
      '.starts_with_dot',
      'ends_with_dot.',
      'UPPER.case',
      'has space.x',
      '1numericstart.x',
      'admin..double_dot',
      '',
    ]) {
      expect(isValidConfigKey(key)).toBe(false)
    }
  })

  it('assertConfigKey throws InvalidConfigKeyError on a bad key', () => {
    expect(() => assertConfigKey('bad')).toThrowError(InvalidConfigKeyError)
  })

  it('assertConfigKey is silent on a good key', () => {
    expect(() => assertConfigKey('admin.password')).not.toThrow()
  })
})
