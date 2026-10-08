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

/** JST instant on the fixture day, the shape every structured timestamp takes (ADR 0006 D-2). */
const at = (hhmm: string) => `2026-07-13T${hhmm}:00+09:00`

const stop = (station: string, transferMinutes: number | null = null, waitMinutes: number | null = null) => ({
  station,
  arrivalPlatform: null,
  departurePlatform: null,
  transferMinutes,
  waitMinutes,
  noAlight: false,
})

/**
 * One structured candidate from 六本木一丁目 to つつじヶ丘: 南北線 to 溜池山王 (with its train type,
 * destination, distance and boarding position, and a 乗換 / 待ち transfer there), then a
 * 銀座線・半蔵門線 leg.
 */
function candidate(departure: string, arrival: string, isFastest = false) {
  const leg = (lineName: string, lineCode: string, from: string, to: string, detail = {}) => ({
    lineName,
    lineCode,
    trainType: null,
    via: null,
    destination: null,
    departAt: at(from),
    arriveAt: at(to),
    minutes: 10,
    distanceKm: null,
    carPosition: null,
    ...detail,
  })
  return {
    departureAt: at(departure),
    arrivalAt: at(arrival),
    durationMinutes: 49,
    transferCount: 1,
    isFastest,
    isFewestTransfers: isFastest,
    stops: [stop(ROPPONGI), stop('溜池山王', 2, 1), stop(TSUTSUJIGAOKA)],
    legs: [
      leg('東京メトロ南北線', 'N', departure, departure, {
        trainType: '各停',
        destination: '浦和美園',
        distanceKm: 3.1,
        carPosition: '3・6号車',
      }),
      leg('東京メトロ銀座線・半蔵門線直通', 'Z', departure, arrival),
    ],
  }
}

function originResult(origin: string, candidates: unknown[], status = 'ok', walkMinutes = 4) {
  return { origin, walkMinutes, searchedFrom: at('18:44'), status, candidates }
}

/** A `GET /api/transit` body: the structured transit contract (ADR 0006 D-2). */
function structured(fastestOrigin: string | null, origins: unknown[]) {
  return { generatedAt: at('18:40'), destination: TSUTSUJIGAOKA, fastestOrigin, origins }
}

const TRANSIT_PAYLOAD = structured(ROPPONGI, [
  originResult(ROPPONGI, [candidate('18:49', '19:38', true), candidate('19:04', '19:52')]),
  originResult(TOKYO, [candidate('18:55', '19:40', true)]),
])

const EMPTY_PAYLOAD = structured(null, [])

/** A tab strip wide enough to overflow a phone viewport - the case `overflow-x: auto` exists for. */
const CROWDED_ORIGINS = ['六本木一丁目', '溜池山王', '東京', '大手町', '国会議事堂前', '新宿三丁目', '渋谷'].map(
  (origin) => originResult(origin, [candidate('18:49', '19:38', true)])
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
    await expect(page.getByRole('tab', { name: new RegExp(ROPPONGI) })).toBeVisible()
    // The destination shows twice: the route line and the expanded card's timeline terminus.
    await expect(page.getByText(TSUTSUJIGAOKA).first()).toBeVisible()
  })

  test('should display status indicator', async ({ page }) => {
    await page.goto('/')

    // A quiet dot plus relative freshness (issue #121); the dot's state is a hidden text label.
    await expect(page.getByText('サーバー接続: 正常')).toHaveCount(1)
    await expect(page.locator('[class*="timestamp"]')).toContainText(/\d+秒前に更新/)
    await expect(page.getByText('Connected')).toHaveCount(0)
  })

  test('should have refresh button', async ({ page }) => {
    await page.goto('/')

    const refreshButton = page.getByRole('button', { name: /refresh/i })
    await expect(refreshButton).toBeVisible()
    await expect(refreshButton).toHaveAttribute('aria-busy', 'false')
  })

  test('should render transit cards once the fetch settles', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('18:49', { exact: true })).toBeVisible()
    // Scoped to the card header's arrival: the selected tab's summary reads `19:38着 最速`, and the
    // expanded route detail repeats `19:38着` as the final arrival (issue #124).
    await expect(page.locator('[class*="_arrival_"]').getByText('19:38着', { exact: true })).toBeVisible()
  })

  test('paints the card outline at the outdoor-legibility border (issue #96)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('18:49', { exact: true })).toBeVisible()

    // The card fill rises to --bg-elevated (#1a1a1a) and the outline to --border-tertiary
    // (#666666), so the card keeps a perceivable edge under outdoor glare (ADR 0004).
    const card = page.locator('[class*="_card_"]').first()
    await expect(card).toBeVisible()
    expect(await computed(card, 'background-color')).toBe('rgb(26, 26, 26)')
    expect(await computed(card, 'border-top-color')).toBe('rgb(102, 102, 102)')
  })

  test('should mark the active tab with aria-selected', async ({ page }) => {
    await page.goto('/')

    const roppongi = page.getByRole('tab', { name: new RegExp(ROPPONGI) })
    const tokyo = page.getByRole('tab', { name: new RegExp(TOKYO) })
    await expect(roppongi).toHaveAttribute('aria-selected', 'true')
    await expect(tokyo).toHaveAttribute('aria-selected', 'false')

    await tokyo.click()
    await expect(tokyo).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('18:55', { exact: true })).toBeVisible()
  })

  test('should display footer with data source', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText(/jorudan/i)).toBeVisible()
  })

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Transit')
    await expect(page.getByRole('tab', { name: new RegExp(ROPPONGI) })).toBeVisible()
  })

  test('should handle dark theme', async ({ page }) => {
    await page.goto('/')

    const body = page.locator('body')
    await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)')
  })
})

test.describe('Error over last-known data (issue #121)', () => {
  test('keeps the cards visible under the banner when a refresh fails', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')
    await expect(page.getByText('18:49', { exact: true })).toBeVisible()

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockApi(page, { transitStatus: 500, transit: { message: 'boom' } })
    await page.getByRole('button', { name: 'Refresh' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('サーバーに接続できません')
    await expect(alert).toContainText(/表示中は \d{2}:\d{2} 時点のデータです/)
    const retry = alert.getByRole('button', { name: '再試行' })
    await expect(retry).toBeVisible()
    const retryBox = await interactiveBox(retry)
    expect(retryBox.width).toBeGreaterThanOrEqual(44)
    expect(retryBox.height).toBeGreaterThanOrEqual(44)
    // The raw hook error ("HTTP error: 500") never reaches the screen.
    await expect(page.getByText(/HTTP error/)).toHaveCount(0)
    await expect(page.getByText('18:49', { exact: true })).toBeVisible()
  })
})

test.describe('Stale-data pill (issue #121)', () => {
  test('raises the amber pill at 180 s and its 更新 button refetches', async ({ page }) => {
    // A fake clock drives the shared useNow() interval, so 3 minutes pass instantly.
    await page.clock.install({ time: new Date('2026-07-13T09:00:00Z') })
    await mockApi(page)
    await page.goto('/')
    await expect(page.locator('[class*="timestamp"]')).toContainText(/秒前に更新/)

    await page.clock.fastForward('03:01')
    await expect(page.getByText(/^3分前のデータ$/)).toBeVisible()

    const update = page.getByRole('button', { name: '更新' })
    const box = await interactiveBox(update)
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)

    const refetch = page.waitForRequest('**/api/transit')
    await update.click()
    await refetch
    await expect(page.locator('[class*="timestamp"]')).toContainText(/秒前に更新/)
    await expect(update).toHaveCount(0)
  })
})

test.describe('Empty state (Tech Debt #7b / state #4)', () => {
  test('shows the empty card, not a blank pane, when a settled fetch returns no origins', async ({
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

    const tabs = page.getByRole('tab')
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
    await mockApi(page, { transit: structured(null, CROWDED_ORIGINS) })
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

    const tab = page.getByRole('tab', { name: new RegExp(ROPPONGI) })
    const routeStation = page.locator('[class*="station"]').first()
    // The expanded fastest card's structured route: its line label, leg meta, boarding position
    // and transfer badge (issue #124).
    const route = page.locator('ol[class*="_route_"]').first()
    const lineName = route.locator('[class*="_name_"]').first()
    const legMeta = route.locator('[class*="_legMeta_"]').first()
    const carValue = route.locator('[class*="_carValue_"]').first()
    const badge = route.locator('[class*="_badge_"]').first()

    for (const target of [tab, routeStation, lineName, legMeta, carValue, badge]) {
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

  test('renders long Japanese names without overflowing the column', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await mockApi(page)
    await page.goto('/')

    const lineName = page.locator('ol[class*="_route_"] [class*="_name_"]').first()
    await expect(lineName).toBeVisible()

    const overflow = await lineName.evaluate((el) => {
      const container = el.closest('[class*="card"]') ?? document.body
      return el.getBoundingClientRect().right - container.getBoundingClientRect().right
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('Route detail (issue #124)', () => {
  test('paints each leg rail in its line colour across the full leg row', async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    const route = page.locator('ol[class*="_route_"]').first()
    await expect(route).toBeVisible()
    const rail = route.locator('[class*="_rail_"]').first()
    // --line-n #00ac9b, reached only through the allow-listed .railN class and currentColor.
    expect(await computed(rail, 'background-color')).toBe('rgb(0, 172, 155)')

    const railBox = await rail.boundingBox()
    const rowBox = await route.locator('[class*="_legRow_"]').first().boundingBox()
    expect(railBox!.height).toBeGreaterThan(0)
    expect(Math.abs(railBox!.height - rowBox!.height)).toBeLessThanOrEqual(1)
    await expect(route.getByText('3・6号車', { exact: true })).toBeVisible()
  })
})

test.describe('Inverted selected chip (issue #95, ADR 0004)', () => {
  test('keeps the selected tab a near-white chip even while hovered', async ({ page }) => {
    // The specificity trap: `.tab:hover` (0,2,0) out-specifies `.tabActive` (0,1,0), so an
    // unscoped hover rule would repaint the selected chip dark - and on iOS :hover sticks after
    // a tap, so a tap on the selected tab would visibly un-invert it. `:not(.tabActive)` fixes it.
    await mockApi(page)
    await page.goto('/')

    const active = page.getByRole('tab', { name: new RegExp(ROPPONGI) })
    await expect(active).toHaveAttribute('aria-selected', 'true')
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

test.describe('Transit card redesign (issue #123)', () => {
  // Pin the clock and the zone: the countdown is departure - walk - now, and the times print JST.
  // 六本木一丁目's first candidate leaves at 18:49 with a 4-minute walk, so leave-by is 18:45. The
  // clock starts mid-minute (18:40:30) so the milliseconds that elapse after install never cross
  // a floor boundary: 4.5 minutes reads あと4分, and each runFor lands half a minute from the next.
  test.use({ timezoneId: 'Asia/Tokyo' })

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(Date.parse(at('18:40')) + 30_000) })
    await mockApi(page)
  })

  const card = (page: Page, index: number) => page.locator('[class*="_card_"]').nth(index)
  const countdown = (page: Page, index: number) => card(page, index).locator('[class*="_countdown_"]')

  test('leads with the departure and reads the arrival, duration, transfers and labels', async ({ page }) => {
    await page.goto('/')

    const first = card(page, 0)
    const departure = first.locator('[class*="_departure_"]')
    await expect(departure).toHaveText('18:49')
    // The 3xl rung (28px).
    expect(await computed(departure, 'font-size')).toBe('28px')
    // The header's arrival, not the expanded route detail's final `19:38着` (issue #124).
    await expect(first.locator('[class*="_arrival_"]')).toHaveText('19:38着')
    await expect(first.getByText('49分 · 乗換1回', { exact: true })).toBeVisible()
    await expect(first.getByText('最速', { exact: true })).toBeVisible()
    await expect(first.getByText('乗換少', { exact: true })).toBeVisible()
    await expect(card(page, 1).getByText('最速', { exact: true })).toHaveCount(0)
  })

  test('counts down to leave-by: green, amber at <= 1 min, dimmed once missed, without reordering', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(countdown(page, 0)).toHaveText('あと4分で出る')
    expect(await computed(countdown(page, 0), 'color')).toBe('rgb(34, 197, 94)')
    await expect(countdown(page, 1)).toHaveText('あと19分で出る')

    // 18:44:00 - 1 minute to leave-by.
    await page.clock.runFor('03:30')
    await expect(countdown(page, 0)).toHaveText('今すぐ出発')
    expect(await computed(countdown(page, 0), 'color')).toBe('rgb(245, 158, 11)')

    // 18:46:00 - past leave-by.
    await page.clock.runFor('02:00')
    await expect(countdown(page, 0)).toHaveText('間に合いません')
    expect(await computed(countdown(page, 0), 'color')).toBe('rgb(138, 138, 138)')
    // The list stays as fetched: the missed train is neither dropped nor moved.
    await expect(page.locator('[class*="_card_"]')).toHaveCount(2)
    await expect(card(page, 0).locator('[class*="_departure_"]')).toHaveText('18:49')
  })

  test('shows the line pills, ring-coloured from tokens, while the card is collapsed', async ({ page }) => {
    await page.goto('/')

    const collapsed = card(page, 1)
    await expect(collapsed.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    const codes = collapsed.locator('[class*="_code_"]')
    await expect(codes).toHaveText(['N', 'Z'])
    await expect(collapsed.getByText('東京メトロ南北線', { exact: true })).toBeVisible()
    // 南北線 #00ac9b and 半蔵門線 #8f76d6, through the allow-listed ring classes; white circle fill.
    expect(await computed(codes.nth(0), 'border-top-color')).toBe('rgb(0, 172, 155)')
    expect(await computed(codes.nth(1), 'border-top-color')).toBe('rgb(143, 118, 214)')
    expect(await computed(codes.nth(0), 'background-color')).toBe('rgb(250, 250, 250)')
    await expect(collapsed.locator('[style]')).toHaveCount(0)
  })
})

test.describe('Station tabs (issue #122, ADR 0007 D-2)', () => {
  // Pin the clock and the zone: the tab summaries and the title print JST wall-clock times.
  test.use({ timezoneId: 'Asia/Tokyo' })

  const KAMIYACHO = '神谷町'
  const AZABU = '麻布十番'
  const TAMEIKE = '溜池山王'

  /** 神谷町 arrives first, so the fastest origin is NOT the first tab; 麻布十番 failed, 溜池山王 has no train. */
  const STATION_PAYLOAD = structured(KAMIYACHO, [
    originResult(ROPPONGI, [candidate('18:49', '19:38', true), candidate('19:04', '19:52')]),
    originResult(KAMIYACHO, [candidate('18:52', '19:30', true)], 'ok', 7),
    originResult(AZABU, [], 'error', 11),
    originResult(TAMEIKE, [], 'no_candidates', 9),
  ])

  const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(name) })

  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(at('18:40')) })
    await mockApi(page, { transit: STATION_PAYLOAD })
  })

  test('exposes a tablist that auto-selects the fastest origin and summarises every tab', async ({ page }) => {
    await page.goto('/')

    const tablist = page.getByRole('tablist', { name: '出発駅' })
    await expect(tablist).toBeVisible()
    await expect(tablist.getByRole('tab')).toHaveCount(4)
    await expect(page.locator('[aria-pressed]')).toHaveCount(0)

    await expect(tab(page, KAMIYACHO)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(page, KAMIYACHO)).toHaveAttribute('tabindex', '0')
    await expect(tab(page, ROPPONGI)).toHaveAttribute('aria-selected', 'false')
    await expect(tab(page, ROPPONGI)).toHaveAttribute('tabindex', '-1')

    await expect(tab(page, KAMIYACHO)).toContainText('19:30着')
    await expect(tab(page, KAMIYACHO)).toContainText('最速')
    await expect(tab(page, ROPPONGI)).toContainText('19:38着')
    await expect(tab(page, ROPPONGI)).toContainText('+8分')
    await expect(tab(page, AZABU)).toContainText('取得できず')
    await expect(tab(page, TAMEIKE)).toContainText('便なし')

    const panel = page.getByRole('tabpanel')
    await expect(panel).toHaveAttribute('aria-labelledby', (await tab(page, KAMIYACHO).getAttribute('id'))!)
    await expect(panel).toContainText(`${KAMIYACHO}`)
    await expect(panel).toContainText('オフィスから徒歩7分 · 到着が早い順')
  })

  test('moves selection and focus with the arrow keys, Home and End', async ({ page }) => {
    await page.goto('/')
    await expect(tab(page, KAMIYACHO)).toHaveAttribute('aria-selected', 'true')

    await tab(page, KAMIYACHO).focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab(page, AZABU)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(page, AZABU)).toBeFocused()

    await page.keyboard.press('End')
    await expect(tab(page, TAMEIKE)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(tab(page, ROPPONGI)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(page, ROPPONGI)).toBeFocused()
    await expect(page.getByText('18:49', { exact: true })).toBeVisible()

    await page.keyboard.press('ArrowLeft')
    await expect(tab(page, TAMEIKE)).toBeFocused()
    await page.keyboard.press('Home')
    await expect(tab(page, ROPPONGI)).toHaveAttribute('aria-selected', 'true')
    await expect(tab(page, ROPPONGI)).toBeFocused()
  })

  test('every station tab answers over at least 44x44', async ({ page }) => {
    await page.goto('/')

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(4)
    for (const target of await tabs.all()) {
      const hit = await interactiveBox(target)
      expect(hit.width).toBeGreaterThanOrEqual(44)
      expect(hit.height).toBeGreaterThanOrEqual(44)
    }
  })

  test('keeps document.title on the active origin and its fastest departure', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle('神谷町 → つつじヶ丘 · 18:52発')
    await tab(page, ROPPONGI).click()
    await expect(page).toHaveTitle('六本木一丁目 → つつじヶ丘 · 18:49発')
    await tab(page, AZABU).click()
    await expect(page).toHaveTitle('麻布十番 → つつじヶ丘')
  })

  test('holds a manual pick through a failed refresh and re-selects the fastest on the next success', async ({
    page,
  }) => {
    await page.goto('/')
    await tab(page, ROPPONGI).click()
    await expect(tab(page, ROPPONGI)).toHaveAttribute('aria-selected', 'true')

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockApi(page, { transitStatus: 500, transit: { message: 'boom' } })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(tab(page, ROPPONGI)).toHaveAttribute('aria-selected', 'true')

    // The release keys off a new lastUpdated; page.clock.install leaves time running, so the
    // second successful fetch lands at a later instant than the first.
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mockApi(page, { transit: STATION_PAYLOAD })
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(tab(page, KAMIYACHO)).toHaveAttribute('aria-selected', 'true')
  })
})
