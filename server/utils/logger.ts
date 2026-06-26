// Citadel Ops — structured logging (Echelon, §25). Pino JSON to stdout with secret
// redaction; child loggers carry the request's correlation keys (traceId etc.) so
// every line is greppable end-to-end. No worker transport → bundles cleanly in Nitro.
import pino from 'pino'
import { getTraceId } from './tracing'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'citadel' },
  redact: {
    paths: [
      'authorization',
      'password',
      'hashedKey',
      'secret',
      'token',
      'req.headers.authorization',
      '*.password',
      '*.hashedKey',
      '*.secret',
      '*.token',
    ],
    censor: '[redacted]',
  },
})

// A logger bound to the current request's correlation keys.
export function reqLogger(extra: Record<string, unknown> = {}) {
  return logger.child({ traceId: getTraceId(), ...extra })
}
