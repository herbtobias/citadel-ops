import { describe, expect, it } from 'vitest'
import { enforceRateLimit } from '../../server/utils/ratelimit'

// No REDIS_URL in the unit env → the in-memory fixed-window path (async).
describe('per-license rate limit', () => {
  it('allows up to the limit then throws 429', async () => {
    const key = `test-${Math.floor(performance.now())}-${process.pid}`
    await expect(enforceRateLimit(key, 3)).resolves.toBeUndefined()
    await expect(enforceRateLimit(key, 3)).resolves.toBeUndefined()
    await expect(enforceRateLimit(key, 3)).resolves.toBeUndefined()
    await expect(enforceRateLimit(key, 3)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('isolates windows per key', async () => {
    const a = `a-${performance.now()}`
    const b = `b-${performance.now()}`
    await expect(enforceRateLimit(a, 1)).resolves.toBeUndefined()
    await expect(enforceRateLimit(b, 1)).resolves.toBeUndefined() // different key, own window
  })
})
