import { describe, expect, it } from 'vitest'
import { isRotatedKeyWithinGrace, ROTATED_KEY_GRACE_SEC } from './auth'

const NOW_MS = 1_770_000_000_000

describe('isRotatedKeyWithinGrace', () => {
  it('accepts a key rotated moments ago', () => {
    expect(isRotatedKeyWithinGrace(new Date(NOW_MS - 1000), NOW_MS)).toBe(true)
  })

  it('accepts a key just inside the window', () => {
    const rotatedAt = new Date(NOW_MS - ROTATED_KEY_GRACE_SEC * 1000 + 1)
    expect(isRotatedKeyWithinGrace(rotatedAt, NOW_MS)).toBe(true)
  })

  it('rejects a key exactly at the window edge', () => {
    const rotatedAt = new Date(NOW_MS - ROTATED_KEY_GRACE_SEC * 1000)
    expect(isRotatedKeyWithinGrace(rotatedAt, NOW_MS)).toBe(false)
  })

  it('rejects a key past the window', () => {
    const rotatedAt = new Date(NOW_MS - (ROTATED_KEY_GRACE_SEC + 3600) * 1000)
    expect(isRotatedKeyWithinGrace(rotatedAt, NOW_MS)).toBe(false)
  })

  it('fails closed on a null rotated_at (pre-column rows)', () => {
    expect(isRotatedKeyWithinGrace(null, NOW_MS)).toBe(false)
    expect(isRotatedKeyWithinGrace(undefined, NOW_MS)).toBe(false)
  })
})
