import { describe, expect, it } from 'vitest'
import { createMissionSchema, transitionSchema } from '../../server/utils/validation'

describe('createMissionSchema', () => {
  it('requires title + sector and applies defaults', () => {
    const parsed = createMissionSchema.parse({ title: 'Build X', sector: 'BACKEND' })
    expect(parsed.type).toBe('feature')
    expect(parsed.priority).toBe('medium')
    expect(parsed.acceptanceCriteria).toEqual([])
  })

  it('rejects a missing sector', () => {
    expect(createMissionSchema.safeParse({ title: 'X' }).success).toBe(false)
  })

  it('rejects an unknown sector', () => {
    expect(createMissionSchema.safeParse({ title: 'X', sector: 'MARKETING' }).success).toBe(false)
  })
})

describe('transitionSchema', () => {
  it('requires a valid target status', () => {
    expect(transitionSchema.safeParse({ to: 'done' }).success).toBe(true)
    expect(transitionSchema.safeParse({ to: 'nope' }).success).toBe(false)
    expect(transitionSchema.safeParse({}).success).toBe(false)
  })
})
