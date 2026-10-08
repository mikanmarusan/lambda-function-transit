import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Candidate, Leg, LineCode } from '../src/types/transit'
import { candidateToRoute } from '../src/types/transit'
import pillStyles from '../src/components/LinePill.module.css'
import cardStyles from '../src/components/TransitCard.module.css'
import detailStyles from '../src/components/RouteDetail.module.css'

/**
 * The redesigned transit card (issue #123): a large departure time, a leave-by countdown badge
 * from the shared clock, `HH:MM着` / `N分 · 乗換N回`, the 最速 / 乗換少 labels, and the line pills
 * that stay visible while the card is collapsed. The clock is mocked so each countdown boundary
 * is driven exactly.
 */

const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('../src/hooks/useNow', () => ({ useNow: () => clock.now }))

import { TransitCard } from '../src/components/TransitCard'
import { LinePill } from '../src/components/LinePill'

const at = (hhmm: string) => `2026-07-13T${hhmm}:00+09:00`
const MIN = 60_000
const WALK = 4
// Departure 18:49 with a 4-minute walk: the rider must leave at 18:45:00.
const LEAVE_AT = Date.parse(at('18:45'))

function leg(lineName: string, lineCode: LineCode | null): Leg {
  return {
    lineName,
    lineCode,
    trainType: null,
    via: null,
    destination: null,
    departAt: at('18:49'),
    arriveAt: at('19:38'),
    minutes: 10,
    distanceKm: null,
    carPosition: null,
  }
}

const station = (name: string) => ({
  station: name,
  arrivalPlatform: null,
  departurePlatform: null,
  transferMinutes: null,
  waitMinutes: null,
  noAlight: false,
})

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    departureAt: at('18:49'),
    arrivalAt: at('19:38'),
    durationMinutes: 49,
    transferCount: 1,
    isFastest: false,
    isFewestTransfers: false,
    stops: [station('六本木一丁目'), station('溜池山王'), station('つつじヶ丘')],
    legs: [leg('東京メトロ南北線', 'N'), leg('京王線', 'KO')],
    ...overrides,
  }
}

function renderCard(nowMs: number, candidate = makeCandidate(), isNext = false) {
  clock.now = nowMs
  return render(
    <TransitCard route={candidateToRoute(candidate)} isNext={isNext} structured={{ candidate, walkMinutes: WALK }} />
  )
}

beforeEach(() => {
  clock.now = 0
})

describe('TransitCard summary', () => {
  it('leads with the departure time and reads HH:MM着 and N分 · 乗換N回', () => {
    renderCard(LEAVE_AT - 10 * MIN)

    expect(screen.getByText('18:49').className).toContain(cardStyles.departure)
    expect(screen.getByText('19:38着')).toBeDefined()
    expect(screen.getByText('49分 · 乗換1回')).toBeDefined()
  })

  it('shows 最速 and 乗換少 from isFastest / isFewestTransfers, and neither when both are false', () => {
    const flagged = renderCard(LEAVE_AT - 10 * MIN, makeCandidate({ isFastest: true, isFewestTransfers: true }))
    expect(screen.getByText('最速')).toBeDefined()
    expect(screen.getByText('乗換少')).toBeDefined()
    flagged.unmount()

    renderCard(LEAVE_AT - 10 * MIN, makeCandidate({ isFastest: false, isFewestTransfers: true }))
    expect(screen.queryByText('最速')).toBeNull()
    expect(screen.getByText('乗換少')).toBeDefined()
  })

  it('renders the legacy fallback without a countdown, labels or line pills', () => {
    clock.now = LEAVE_AT - 10 * MIN
    const { container } = render(
      <TransitCard route={{ summary: '18:49発 → 19:38着(49分)(1回)', route: '■六本木一丁目\n｜東京メトロ南北線' }} isNext={false} />
    )

    expect(screen.getByText('18:49')).toBeDefined()
    expect(screen.getByText('19:38着')).toBeDefined()
    expect(container.querySelector(`.${cardStyles.countdown}`)).toBeNull()
    expect(container.querySelector(`.${pillStyles.pill}`)).toBeNull()
    expect(screen.queryByText('最速')).toBeNull()
  })
})

describe('TransitCard countdown badge', () => {
  const badge = (container: HTMLElement) => container.querySelector(`.${cardStyles.countdown}`)

  it.each([
    [10, 'あと10分で出る', 'countdownGo'],
    [2, 'あと2分で出る', 'countdownGo'],
    [1, '今すぐ出発', 'countdownNow'],
    [0, '今すぐ出発', 'countdownNow'],
    [-1, '間に合いません', 'countdownMissed'],
  ] as const)('%i minute(s) before leave-by reads %s', (minutes, label, tone) => {
    const { container } = renderCard(LEAVE_AT - minutes * MIN)

    const node = badge(container)
    expect(node?.textContent).toBe(label)
    expect(node?.className).toContain(cardStyles[tone])
  })

  it('recomputes the badge from the clock value on the same mounted card', () => {
    const { container, rerender } = renderCard(LEAVE_AT - 3 * MIN)
    expect(badge(container)?.textContent).toBe('あと3分で出る')

    // A later tick: the same card stays on screen and only its badge changes.
    clock.now = LEAVE_AT + MIN
    const candidate = makeCandidate()
    rerender(<TransitCard route={candidateToRoute(candidate)} isNext={false} structured={{ candidate, walkMinutes: WALK }} />)
    expect(badge(container)?.textContent).toBe('間に合いません')
    expect(screen.getByText('18:49')).toBeDefined()
  })
})

describe('TransitCard line pills', () => {
  it('shows every leg as a pill joined by chevrons while the card is collapsed', () => {
    const { container } = renderCard(LEAVE_AT - 10 * MIN)

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
    const pills = container.querySelectorAll(`.${pillStyles.pill}`)
    expect([...pills].map(pill => pill.textContent)).toEqual(['N東京メトロ南北線', 'KO京王線'])
    // One chevron between the two pills.
    expect(container.querySelectorAll(`.${cardStyles.chevron}`)).toHaveLength(1)
  })
})

describe('TransitCard expanded route', () => {
  it('hands the structured candidate to RouteDetail, which draws the structured route', () => {
    const { container } = renderCard(LEAVE_AT - 10 * MIN, makeCandidate(), true)

    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('ol')?.className).toBe(detailStyles.route)
    expect(container.querySelector('time')?.textContent).toBe('18:49発')
  })

  it('draws the legacy timeline when the card has no structured candidate', () => {
    clock.now = LEAVE_AT
    const { container } = render(<TransitCard route={candidateToRoute(makeCandidate())} isNext />)

    expect(container.querySelector('ol')?.className).toBe(detailStyles.timeline)
    expect(container.querySelector('time')).toBeNull()
  })
})

describe('LinePill', () => {
  it.each([
    ['N', 'lineN'],
    ['M', 'lineM'],
    ['H', 'lineH'],
    ['Z', 'lineZ'],
    ['E', 'lineE'],
    ['S', 'lineS'],
    ['KO', 'lineKo'],
  ] as const)('rings %s with its allow-listed class %s and shows the letter code', (code, ringClass) => {
    const { container } = render(<LinePill lineCode={code} lineName="路線" />)

    const circle = container.querySelector(`.${pillStyles.code}`)
    expect(circle?.textContent).toBe(code)
    expect(circle?.className).toContain(pillStyles[ringClass])
    expect(screen.getByText('路線')).toBeDefined()
  })

  it('shows a null code as the line name alone in the neutral style, with no circle', () => {
    const { container } = render(<LinePill lineCode={null} lineName="京王井の頭線" />)

    expect(container.querySelector(`.${pillStyles.code}`)).toBeNull()
    expect(screen.getByText('京王井の頭線').className).toContain(pillStyles.nameNeutral)
  })

  it('treats a code outside the allow-list as unknown, never as a class or style', () => {
    // The validator already drops such a payload; this pins the component's own guard too.
    const { container } = render(<LinePill lineCode={'constructor' as LineCode} lineName="謎の線" />)

    expect(container.querySelector(`.${pillStyles.code}`)).toBeNull()
    expect(screen.getByText('謎の線').className).toContain(pillStyles.nameNeutral)
    expect(container.querySelector('[style]')).toBeNull()
  })

  it('never writes response data into a style attribute', () => {
    const { container } = renderCard(LEAVE_AT - 10 * MIN, makeCandidate({ isFastest: true, isFewestTransfers: true }))
    expect(container.querySelector('[style]')).toBeNull()
  })
})
