import { describe, expect, it } from 'vitest'
import { enforceRateLimit } from '../../server/utils/ratelimit'

describe('per-license rate limit', () => {
  it('allows up to the limit then throws 429', () => {
    const key = `test-${Math.floor(performance.now())}-${process.pid}`
    expect(() => enforceRateLimit(key, 3)).not.toThrow()
    expect(() => enforceRateLimit(key, 3)).not.toThrow()
    expect(() => enforceRateLimit(key, 3)).not.toThrow()
    try {
      enforceRateLimit(key, 3)
      throw new Error('expected rate limit to trip')
    } catch (e: any) {
      expect(e.statusCode).toBe(429)
    }
  })

  it('isolates windows per key', () => {
    const a = `a-${performance.now()}`
    const b = `b-${performance.now()}`
    expect(() => enforceRateLimit(a, 1)).not.toThrow()
    expect(() => enforceRateLimit(b, 1)).not.toThrow() // different key, own window
  })
})
