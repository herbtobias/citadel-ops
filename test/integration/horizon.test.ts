// Integration tests for the HORIZON Redis backplane (§M2/M4/M10). Opt-in: set REDIS_URL to run
// (they self-skip otherwise, so `npm test` stays infrastructure-free).
//   REDIS_URL=redis://localhost:6380 npm test
import { describe, expect, it } from 'vitest'

const RUN = !!process.env.REDIS_URL

describe.skipIf(!RUN)('integration: HORIZON multi-instance backplane (requires REDIS_URL)', () => {
  it('the rate limit is shared across instances (§HORIZON M4)', async () => {
    const { enforceRateLimit } = await import('../../server/utils/ratelimit')
    const key = `m10-rl-${Date.now()}`
    // A single shared Redis counter: two calls pass, the third (over the limit) trips 429 —
    // exactly what should happen if these calls came from two different instances.
    await expect(enforceRateLimit(key, 2)).resolves.toBeUndefined()
    await expect(enforceRateLimit(key, 2)).resolves.toBeUndefined()
    await expect(enforceRateLimit(key, 2)).rejects.toMatchObject({ statusCode: 429 })
  })

  it('an event from another instance reaches a local SSE subscriber (§HORIZON M2 fan-out)', async () => {
    const { subscribeEvents } = await import('../../server/utils/events')
    const Redis = (await import('ioredis')).default
    const pub = new Redis(process.env.REDIS_URL!)

    const received: { type: string }[] = []
    const off = subscribeEvents((e) => received.push(e))
    await new Promise((r) => setTimeout(r, 250)) // let our subscriber connect to the channel

    // Simulate a DIFFERENT instance publishing (foreign origin → not skipped as our own).
    await pub.publish(
      'citadel:events',
      JSON.stringify({
        origin: 'another-instance',
        event: { projectId: null, type: 'm10_probe', ts: Date.now() },
      }),
    )
    await new Promise((r) => setTimeout(r, 500))
    off()
    await pub.quit()

    expect(
      received.some((e) => e.type === 'm10_probe'),
      'cross-instance event not delivered',
    ).toBe(true)
  })
})
