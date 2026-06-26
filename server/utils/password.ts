// Citadel Ops — password hashing. Uses Node's scrypt (no native build step).
// NOTE: the plan named argon2; scrypt keeps the dep tree pure-JS/native-free.
// The format is `salt:hash` (both hex). Swappable for argon2 later without
// touching call sites.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEYLEN).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(stored: string | null | undefined, password: string): boolean {
  if (!stored || !stored.includes(':')) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, KEYLEN)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
