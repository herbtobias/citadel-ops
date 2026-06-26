import { describe, expect, it } from 'vitest'
import {
  allowedTransitions,
  assertTransition,
  canTransition,
} from '../../server/utils/state-machine'

describe('mission state-machine', () => {
  it('allows the design path designing → cold_read → ready', () => {
    expect(canTransition('designing', 'cold_read')).toBe(true)
    expect(canTransition('cold_read', 'ready')).toBe(true)
    expect(canTransition('cold_read', 'designing')).toBe(true) // fail → revise
  })

  it('allows the work path ready → in_progress → in_review → done', () => {
    expect(canTransition('ready', 'in_progress')).toBe(true)
    expect(canTransition('in_progress', 'in_review')).toBe(true)
    expect(canTransition('in_review', 'done')).toBe(true)
  })

  it('rejects illegal jumps', () => {
    expect(canTransition('backlog', 'done')).toBe(false)
    expect(canTransition('backlog', 'in_progress')).toBe(false)
    expect(canTransition('done', 'ready')).toBe(false)
  })

  it('treats same-status as a no-op (idempotent) and cancelled as terminal', () => {
    expect(canTransition('in_progress', 'in_progress')).toBe(true)
    expect(allowedTransitions('cancelled')).toHaveLength(0)
    expect(canTransition('cancelled', 'ready')).toBe(false)
  })

  it('allows reopening a done mission', () => {
    expect(canTransition('done', 'in_progress')).toBe(true)
  })

  it('assertTransition throws a 422 on an illegal transition', () => {
    expect(() => assertTransition('backlog', 'done')).toThrowError(/Illegal transition/)
    try {
      assertTransition('backlog', 'done')
    } catch (e: any) {
      expect(e.statusCode).toBe(422)
    }
  })

  it('assertTransition passes a legal transition', () => {
    expect(() => assertTransition('ready', 'in_progress')).not.toThrow()
  })
})
