import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * The API is stubbed at the network layer (`page.route`), so the suite runs against the Vite dev
 * server alone: no Lambda, no Jorudan, no docker-compose. That is deliberate. Before this, the
 * specs raced a live scraper - three of them failed outright without a backend on :8000, and the
 * rest could not pin a state (empty / error / loading) at all, because the fixture was whatever
 * Jorudan happened to return. Stubbing is what makes the states below assertable.
 */

const TSUTSUJIGAOKA = 'つつじヶ丘'
const ROPPONGI = '六本木一丁目'
const TOKYO = '東京'

const ROUTE_BODY = [
  `■${ROPPONGI}`,
  '｜東京メトロ南北線',
  '◇溜池山王',
  '｜東京メトロ銀座線・半蔵門線直通',
  `■${TSUTSUJIGAOKA}`,
].join('\n')

const TRANSIT_PAYLOAD = {
  routes: [
    {
      origin: ROPPONGI,
      destination: TSUTSUJIGAOKA,
      transfers: [
        ['18:49発 → 19:38着(49分)(1回)', ROUTE_BODY],
        ['19:04発 → 19:52着(48分)(1回)', ROUTE_BODY],
      ],
    },
    {
      origin: TOKYO,
      destination: TSUTSUJIGAOKA,
      transfers: [['18:55発 → 19:40着(45分)(1回)', ROUTE_BODY]],
    },
  ],
}

const EMPTY_PAYLOAD = { routes: [] }

/** A tab strip wide enough to overflow a phone viewport - the case `overflow-x: auto` exists for. */
const CROWDED_ORIGINS = ['六本木一丁目', '溜池山王', '東京', '大手町', '国会議事堂前', '新宿三丁目', '渋谷'].map(
  (origin) => ({
    origin,
    destination: TSUTSUJIGAOKA,
    transfers: [['18:49発 → 19:38着(49分)(1回)', ROUTE_BODY]],
  })
)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface MockOptions {
  transit?: unknown
  transitStatus?: number
  transitDelayMs?: number
  statusDelayMs?: number
}

async function mockApi(page: Page, options: MockOptions = {}) {
  const {
    transit = TRANSIT_PAYLOAD,
    transitStatus = 200,
    transitDelayMs = 0,
    statusDelayMs = 0,
  } = options

  await page.route('**/api/status', async (route) => {
    if (statusDelayMs) await sleep(statusDelayMs)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', timestamp: '2026-07-13T09:00:00Z' }),
    })
  })

  await page.route('**/api/transit', async (route) => {
    if (transitDelayMs) await sleep(transitDelayMs)
    await route.fulfill({
      status: transitStatus,
      contentType: 'application/json',
      body: JSON.stringify(transit),
    })
  })
}

/**
 * The *interactive* box, not the painted one. `.refreshButton` keeps a 32x32 visual box and grows
 * its hit area with a transparent 44x44 `::after`, which `boundingBox()` cannot see - so probe
 * `elementFromPoint` outwards from the centre instead and report how far the element still answers.
 * Hit-testing a pseudo-element resolves to its originating element, so the probe measures exactly
 * what a fingertip would reach.
 */
async function interactiveBox(target: Locator): Promise<{ width: number; height: number }> {
  return target.evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const hits = (x: number, y: number) => {
      const found = document.elementFromPoint(x, y)
      return found === el || el.contains(found)
    }
    const reach = (horizontal: boolean) => {
      const half = (horizontal ? rect.width : rect.height) / 2
      let out = Math.floor(half)
      for (let d = Math.floor(half); d <= 80; d++) {
        const ok = horizontal
          ? hits(cx - d + 0.5, cy) && hits(cx + d - 0.5, cy)
          : hits(cx, cy - d + 0.5) && hits(cx, cy + d - 0.5)
        if (!ok) break
        out = d
      }
      return out * 2
    }
    return { width: reach(true), height: reach(false) }
  })
}

const computed = (target: Locator, property: string) =>
  target.evaluate(
    (el, prop) => window.getComputedStyle(el).getPropertyValue(prop),
    property
  )

test.describe('Transit App', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
  })

  test('should display header with title', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Transit')
    await expect(page.getByRole('button', { name: ROPPONGI })).toBeVisible()
    // The destination shows twice: the route line and the expanded card's timeline terminus.
    await expect(page.getByText(TSUTSUJIGAOKA).first()).toBeVisible()
  })

  test('should display status indicator', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Connected')).toBeVisible()
    await expect(page.locator('[class*="timestamp"]')).toContainText('Updated')
  })

  test('should have refresh button', async ({ page }) => {
    await page.goto('/')

    const refreshButton = page.getByRole('button', { name: /refresh/i })
    await expect(refreshButton).toBeVisible()
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false')
  })

  test('should render transit cards once the fetch settles', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('18:49')).toBeVisible()
    await expect(page.getByText('19:38')).toBeVisible()
  })

  test('paints the card outline at the outdoor-legibility border (issue #96)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('18:49')).toBeVisible()

    // The card fill rises to --bg-elevated (#1a1a1a) and the outline to --border-tertiary
    // (#666666), so the card keeps a perceivable edge under outdoor glare (ADR 0004).
    const card = page.locator('[class*="_card_"]').first()
    await expect(card).toBeVisible()
    expect(await computed(card, 'background-color')).toBe('rgb(26, 26, 26)')
    expect(await computed(card, 'border-top-color')).toBe('rgb(102, 102, 102)')
  })

  test('should mark the active tab with aria-pressed', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('button', { name: ROPPONGI })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: TOKYO })).toHaveAttribute('aria-pressed', 'false')

    await page.getByRole('button', { name: TOKYO }).click()
    await expect(page.getByRole('button', { name: TOKYO })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('18:55')).toBeVisible()
  })

  test('should display footer with data source', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText(/jorudan/i)).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Transit')
    await expect(page.getByRole('button', { name: ROPPONGI })).toBeVisible()
  })

  test('should handle dark theme', async ({ page }) => {
    await page.goto('/')

    const body = page.locator('body')
    await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)')
  })
})

test.describe('Empty state (Tech Debt #7b / state #4)', () => {
  test('shows the empty card, not a blank pane, when a settled fetch returns no routes', async ({
    page,
  }) => {
    await mockApi(page, { transit: EMPTY_PAYLOAD })
    await page.goto('/')

    const empty = page.getByRole('status')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('No departures found')
    // Phosphor Tray glyph, and nothing wearing the error red.
    await expect(empty.locator('svg')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    // `_card_<hash>`: CSS Modules scope by local name, never by file name, so a
    // `[class*="TransitCard"]` locator would silently match nothing and guard nothing.
    await expect(page.locator('[class*="_card_"]')).toHaveCount(0)
  })

  test('keeps the card list out of the live region so a tab switch is not re-announced', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const live = page.locator('[aria-live="polite"]')
    await expect(live).toHaveCount(1)
    await expect(live.locator('[class*="_card_"]')).toHaveCount(0)
    await expect(page.locator('[class*="_card_"]').first()).toBeVisible()

    // Cards are showing, so the region is empty - and it has to stay in the accessibility tree
    // anyway. `display: none` would prune it, and a region that appears together with its content
    // announces nothing (Tech Debt #9). `toHaveCount` alone would not catch that: it counts
    // hidden nodes too.
    expect(await computed(live, 'display')).not.toBe('none')
    expect(await live.evaluate((el) => el.getBoundingClientRect().height)).toBe(0)
  })
})

test.describe('Touch targets (Tech Debt #6)', () => {
  test('refresh button answers over at least 44x44', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const refresh = page.getByRole('button', { name: /refresh/i })
    await expect(refresh).toBeVisible()

    // The visual box stays 32x32 by design - only the hit area grows.
    const visual = await refresh.boundingBox()
    expect(visual?.width).toBeCloseTo(32, 0)
    expect(visual?.height).toBeCloseTo(32, 0)

    const hit = await interactiveBox(refresh)
    expect(hit.width).toBeGreaterThanOrEqual(44)
    expect(hit.height).toBeGreaterThanOrEqual(44)
  })

  test('every origin tab answers over at least 44x44', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const tabs = page.getByRole('button', { name: new RegExp(`${ROPPONGI}|${TOKYO}`) })
    await expect(tabs).toHaveCount(2)

    for (const tab of await tabs.all()) {
      const hit = await interactiveBox(tab)
      expect(hit.width).toBeGreaterThanOrEqual(44)
      expect(hit.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('the 44px floor never squeezes a crowded tab strip', async ({ page }) => {
    // `min-width: 44px` on a flex item REPLACES the automatic content-width minimum, so without
    // `flex: 0 0 auto` a full strip would shrink every tab to 44px and spill its nowrap label over
    // the neighbours - while still passing the 44x44 check above. Crowd the strip and prove the
    // labels stay inside their own boxes and the strip scrolls instead.
    await page.setViewportSize({ width: 375, height: 667 })
    await mockApi(page, { transit: { routes: CROWDED_ORIGINS } })
    await page.goto('/')

    const tabs = page.locator('[class*="_tab_"]')
    await expect(tabs).toHaveCount(CROWDED_ORIGINS.length)

    for (const tab of await tabs.all()) {
      const clipped = await tab.evaluate((el) => el.scrollWidth - el.clientWidth)
      expect(clipped).toBeLessThanOrEqual(1)
    }

    const strip = page.locator('[class*="_tabs_"]')
    const scrolls = await strip.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(scrolls).toBe(true)
  })
})

test.describe('Reduced motion (Tech Debt #7a)', () => {
  test('stops the refresh spinner and the status pulse', async ({ page }) => {
    // `reducedMotion: 'reduce'` is set per page rather than through `test.use({ reducedMotion })`:
    // the fixture option does not reach the pinned chromium-headless-shell build (matchMedia stays
    // false there), while emulateMedia does. Same preference, one that actually lands.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Both animations only run while their fetch is in flight, so hold both responses open.
    await mockApi(page, { transitDelayMs: 5000, statusDelayMs: 5000 })
    await page.goto('/')

    const spinner = page.locator('[class*="spinner"]').first()
    await expect(spinner).toBeVisible()
    expect(await computed(spinner, 'animation-name')).toBe('none')

    const pulse = page.locator('[class*="iconLoading"]')
    await expect(pulse).toBeVisible()
    expect(await computed(pulse, 'animation-name')).toBe('none')
    // The dot is pinned opaque rather than frozen at the keyframe's 0.3.
    expect(await computed(pulse, 'opacity')).toBe('1')
  })
})

test.describe('Motion is on by default', () => {
  test('spins the refresh spinner when no motion preference is set', async ({ page }) => {
    await mockApi(page, { transitDelayMs: 5000, statusDelayMs: 5000 })
    await page.goto('/')

    // CSS Modules scope @keyframes too, so the computed name is the hashed `_spin_<hash>`.
    const spinner = page.locator('[class*="spinner"]').first()
    await expect(spinner).toBeVisible()
    expect(await computed(spinner, 'animation-name')).toMatch(/spin/)

    const pulse = page.locator('[class*="iconLoading"]')
    await expect(pulse).toBeVisible()
    expect(await computed(pulse, 'animation-name')).toMatch(/pulse/)
  })
})

test.describe('CJK typography', () => {
  test('sets kinsoku and open line-height on station, line and tab labels', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const tab = page.getByRole('button', { name: ROPPONGI })
    const routeStation = page.locator('[class*="station"]').first()
    const lineName = page.locator('[class*="lineName"]').first()

    for (const target of [tab, routeStation, lineName]) {
      await expect(target).toBeVisible()
      expect(await computed(target, 'word-break')).toBe('normal')
      expect(await computed(target, 'line-break')).toBe('strict')
      // No letter-spacing on CJK - tracking is Latin/numeral only.
      expect(await computed(target, 'letter-spacing')).toBe('normal')

      const fontSize = parseFloat(await computed(target, 'font-size'))
      const lineHeight = parseFloat(await computed(target, 'line-height'))
      // Chromium rounds the used line-height to 1/64 px, so compare with a sub-pixel tolerance
      // instead of demanding an exact 1.6 ratio.
      expect(lineHeight).toBeGreaterThanOrEqual(fontSize * 1.6 - 0.02)
    }
  })

  test('confines word-break: break-word to the raw <pre> fallback', async ({ page }) => {
    // `word-break: normal` above is also the CSS initial value, so on its own it proves nothing.
    // What has to hold is the *separation*: break-word is the raw fallback's alone and must not
    // reach the station and line labels, where it would break a name mid-glyph.
    await mockApi(page, {
      transit: {
        routes: [
          {
            origin: ROPPONGI,
            destination: TSUTSUJIGAOKA,
            // No ■/◇ markers: parseRoute() yields nothing and RouteDetail drops to <pre>.
            transfers: [['18:49発 → 19:38着(49分)(1回)', '六本木一丁目から溜池山王を経てつつじヶ丘まで']],
          },
        ],
      },
    })
    await page.goto('/')

    const raw = page.locator('[class*="rawRoute"]')
    await expect(raw).toBeVisible()
    expect(await computed(raw, 'word-break')).toBe('break-word')

    // break-word belongs to the fallback alone: the station label rendered from the same response
    // must still compute `normal`. (`word-break` inherits, so a container-level declaration is
    // exactly how it would leak.)
    const station = page.locator('[class*="_station_"]').first()
    await expect(station).toBeVisible()
    expect(await computed(station, 'word-break')).toBe('normal')
  })

  test('renders long Japanese names without overflowing the column', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockApi(page)
    await page.goto('/')

    const lineName = page.locator('[class*="lineName"]').first()
    await expect(lineName).toBeVisible()

    const overflow = await lineName.evaluate((el) => {
      const container = el.closest('[class*="card"]') ?? document.body
      return el.getBoundingClientRect().right - container.getBoundingClientRect().right
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('Inverted selected chip (issue #95, ADR 0004)', () => {
  test('keeps the selected tab a near-white chip even while hovered', async ({ page }) => {
    // The specificity trap: `.tab:hover` (0,2,0) out-specifies `.tabActive` (0,1,0), so an
    // unscoped hover rule would repaint the selected chip dark - and on iOS :hover sticks after
    // a tap, so a tap on the selected tab would visibly un-invert it. `:not(.tabActive)` fixes it.
    await mockApi(page)
    await page.goto('/')

    const active = page.getByRole('button', { name: ROPPONGI })
    await expect(active).toHaveAttribute('aria-pressed', 'true')
    // The inverted chip fill, --bg-inverted #fafafa.
    expect(await computed(active, 'background-color')).toBe('rgb(250, 250, 250)')

    await active.hover()
    // `.tab` carries a 100ms `transition: all`, so wait past it and read the settled colour: an
    // unscoped `.tab:hover` would animate the chip to the dark --bg-secondary fill, but reading
    // at t=0 would still catch the near-white start frame and miss the regression.
    await page.waitForTimeout(300)
    expect(await computed(active, 'background-color')).toBe('rgb(250, 250, 250)')
  })
})

test.describe('Computed token values', () => {
  test('paints arrival time with the blue accent and the error banner with red', async ({
    page,
  }) => {
    await mockApi(page)
    await page.goto('/')

    const arrival = page.locator('[class*="arrival"]').first()
    await expect(arrival).toBeVisible()
    expect(await computed(arrival, 'color')).toBe('rgb(59, 130, 246)')

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockApi(page, { transitStatus: 500, transit: { message: 'boom' } })
    await page.reload()

    const error = page.getByRole('alert')
    await expect(error).toBeVisible()
    expect(await computed(error, 'color')).toBe('rgb(239, 68, 68)')
  })

  test('paints the empty card on the elevated surface, never the error red', async ({ page }) => {
    await mockApi(page, { transit: EMPTY_PAYLOAD })
    await page.goto('/')

    const empty = page.getByRole('status')
    await expect(empty).toBeVisible()
    expect(await computed(empty, 'background-color')).toBe('rgb(26, 26, 26)')
    expect(await computed(empty, 'color')).toBe('rgb(161, 161, 161)')
  })
})
