import { describe, expect, it } from 'vitest'
import { createMissionSchema, isUuid, transitionSchema } from '../../server/utils/validation'

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

describe('isUuid', () => {
  it('accepts a well-formed UUID (any case)', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('rejects malformed ids that would trip Postgres 22P02', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('123')).toBe(false)
    expect(isUuid('WEB-42')).toBe(false)
    expect(isUuid('550e8400-e29b-41d4-a716-44665544000')).toBe(false) // one char short
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})

describe('transitionSchema', () => {
  it('requires a valid target status', () => {
    expect(transitionSchema.safeParse({ to: 'done' }).success).toBe(true)
    expect(transitionSchema.safeParse({ to: 'nope' }).success).toBe(false)
    expect(transitionSchema.safeParse({}).success).toBe(false)
  })
})
