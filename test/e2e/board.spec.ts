import { expect, test } from '@playwright/test'
import { login } from './helpers'

// Board smoke (§18). After login the index redirects to the first project's board;
// confirm the Kanban actually renders the toolbar and seeded mission cards.

test.describe('board', () => {
  test('login lands on a board with the toolbar and seeded missions', async ({ page }) => {
    await login(page)

    await expect(page).toHaveURL(/\/board/)
    // The "New Mission" action confirms the board toolbar rendered…
    await expect(page.getByRole('button', { name: /New Mission/i })).toBeVisible()
    // …and at least one seeded mission card carries a data-mission-key.
    await expect(page.locator('[data-mission-key]').first()).toBeVisible()
  })
})
