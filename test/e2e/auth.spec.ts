import { expect, test } from '@playwright/test'
import { DEMO, gotoReady, login } from './helpers'

// Auth smoke (§18). The human entry point: log in, fail to log in, recover access.
// Inputs are located by type and visible copy rather than CSS classes so a re-skin
// doesn't break the suite. (The labels aren't `for`-associated, so getByLabel
// wouldn't match.)

test.describe('authentication', () => {
  test('valid credentials log in and land in the app', async ({ page }) => {
    await login(page)
    // Post-login index redirects to the first project's board; either way we're
    // off /login and the app chrome (sidebar brand) is present.
    await expect(page.getByText('CITADEL OPS').first()).toBeVisible()
  })

  test('wrong password shows an error and stays on /login', async ({ page }) => {
    await gotoReady(page, '/login')
    await page.locator('input[type="email"]').fill(DEMO.email)
    await page.locator('input[type="password"]').fill('definitely-wrong')
    await page.getByRole('button', { name: 'Acquire License' }).click()

    await expect(page.locator('.text-destructive')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('forgot-password shows a no-enumeration confirmation', async ({ page }) => {
    await gotoReady(page, '/forgot-password')
    await page.locator('input[type="email"]').fill('nobody@citadel.test')
    await page.getByRole('button', { name: 'Send reset link' }).click()

    await expect(page.getByText(/reset link is on its way/i)).toBeVisible()
  })

  test('reset-password without a token is rejected', async ({ page }) => {
    await gotoReady(page, '/reset-password')
    await expect(page.getByText('Missing or invalid reset link.')).toBeVisible()
  })

  test('an authenticated route redirects to /login when logged out', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page).toHaveURL(/\/login/)
  })
})
