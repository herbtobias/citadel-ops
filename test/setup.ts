// Vitest setup — server utils call Nitro's auto-imported `createError`. Shim it with
// h3's implementation so the utilities are testable in isolation.
import { createError } from 'h3'
;(globalThis as any).createError = (globalThis as any).createError ?? createError
