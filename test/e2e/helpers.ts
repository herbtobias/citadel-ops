import { expect, type Page } from '@playwright/test'

// In dev mode Nuxt hydrates the page a beat after the SSR HTML lands. If a test
// clicks a submit button before the client `@submit.prevent` handler is wired, the
// browser performs a NATIVE form GET (URL gains a bare `?`) and the $fetch flow
// never runs. `useNuxtApp().isHydrating` flips to false once hydration completes —
// a precise signal, unlike networkidle — so wait on that before interacting.
export async function gotoReady(page: Page, path: string) {
  await page.goto(path)
  await page.waitForFunction(
    () => {
      const w = window as unknown as { useNuxtApp?: () => { isHydrating?: boolean } }
      try {
        return w.useNuxtApp?.().isHydrating === false
      } catch {
        return false
      }
    },
    null,
    { timeout: 15_000 },
  )
}

export const DEMO = { email: 'hq@citadel.test', password: 'citadel123' }

// Drive the login form and wait until we've left /login.
export async function login(page: Page) {
  await gotoReady(page, '/login')
  await page.locator('input[type="email"]').fill(DEMO.email)
  await page.locator('input[type="password"]').fill(DEMO.password)
  await page.getByRole('button', { name: 'Acquire License' }).click()
  await expect(page).not.toHaveURL(/\/login/)
}
