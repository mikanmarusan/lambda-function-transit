import { test, expect } from '@playwright/test'

test.describe('Transit App', () => {
  test('should display header with title', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Transit')
    await expect(page.getByText('六本木一丁目')).toBeVisible()
    await expect(page.getByText('つつじヶ丘')).toBeVisible()
  })

  test('should display status indicator', async ({ page }) => {
    await page.goto('/')

    const statusIndicator = page.locator('[class*="StatusIndicator"]')
    await expect(statusIndicator).toBeVisible()
  })

  test('should have refresh button', async ({ page }) => {
    await page.goto('/')

    const refreshButton = page.getByRole('button', { name: /refresh/i })
    await expect(refreshButton).toBeVisible()
  })

  test('should display loading state initially', async ({ page }) => {
    await page.goto('/')

    // Either loading state or transit cards should be visible
    const loading = page.getByText(/loading/i)
    const cards = page.locator('[class*="TransitCard"]')

    await expect(loading.or(cards.first())).toBeVisible({ timeout: 10000 })
  })

  test('should display footer with data source', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText(/jorudan/i)).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Header should still be visible
    await expect(page.locator('h1')).toHaveText('Transit')

    // Route info should be visible
    await expect(page.getByText('六本木一丁目')).toBeVisible()
  })

  test('should handle dark theme', async ({ page }) => {
    await page.goto('/')

    // Check that body has dark background
    const body = page.locator('body')
    await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)')
  })
})
