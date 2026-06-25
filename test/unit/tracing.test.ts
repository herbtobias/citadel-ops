import { describe, expect, it } from 'vitest'
import { genTraceId, traceIdFromHeaders } from '../../server/utils/tracing'

describe('trace id extraction', () => {
  it('prefers x-trace-id', () => {
    expect(traceIdFromHeaders('00-abc-def-01', 'mytrace')).toBe('mytrace')
  })

  it('parses the trace-id out of a W3C traceparent', () => {
    expect(traceIdFromHeaders('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', null))
      .toBe('4bf92f3577b34da6a3ce929d0e0e4736')
  })

  it('returns null when no headers are present', () => {
    expect(traceIdFromHeaders(null, null)).toBeNull()
  })

  it('generates a 16-byte hex trace id', () => {
    expect(genTraceId()).toMatch(/^[0-9a-f]{32}$/)
  })
})
