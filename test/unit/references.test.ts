import { describe, expect, it } from 'vitest'
import { INVERSE_LINK } from '../../server/utils/references'

describe('reference inverse map', () => {
  it('pairs asymmetric link types correctly', () => {
    expect(INVERSE_LINK.tests).toBe('tested_by')
    expect(INVERSE_LINK.tested_by).toBe('tests')
    expect(INVERSE_LINK.fixes).toBe('fixed_by')
    expect(INVERSE_LINK.blocks).toBe('blocked_by')
    expect(INVERSE_LINK.spawns).toBe('spawned_from')
    expect(INVERSE_LINK.spawned_from).toBe('spawns')
  })

  it('keeps symmetric link types self-inverse', () => {
    expect(INVERSE_LINK.relates_to).toBe('relates_to')
    expect(INVERSE_LINK.duplicates).toBe('duplicates')
  })

  it('is an involution — inverse of inverse is identity', () => {
    for (const [k, v] of Object.entries(INVERSE_LINK)) {
      expect(INVERSE_LINK[v]).toBe(k)
    }
  })
})
