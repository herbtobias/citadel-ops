import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../server/utils/password'
import { generateLicenseKey, hashLicenseKey } from '../../server/utils/license'

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('citadel123')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(verifyPassword(stored, 'citadel123')).toBe(true)
    expect(verifyPassword(stored, 'wrong')).toBe(false)
  })

  it('salts — same password hashes differently each time', () => {
    expect(hashPassword('x')).not.toBe(hashPassword('x'))
  })

  it('handles missing/garbage stored hashes safely', () => {
    expect(verifyPassword(null, 'x')).toBe(false)
    expect(verifyPassword('garbage', 'x')).toBe(false)
  })
})

describe('license keys', () => {
  it('generates lic_-prefixed keys', () => {
    expect(generateLicenseKey()).toMatch(/^lic_[0-9a-f]{48}$/)
    expect(generateLicenseKey()).not.toBe(generateLicenseKey())
  })

  it('hashes keys deterministically (lookup by hash)', () => {
    expect(hashLicenseKey('lic_demo')).toBe(hashLicenseKey('lic_demo'))
    expect(hashLicenseKey('lic_a')).not.toBe(hashLicenseKey('lic_b'))
  })
})
