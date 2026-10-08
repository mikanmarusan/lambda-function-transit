import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Candidate, OriginResult } from '../src/types/transit'
import cardStyles from '../src/components/TransitCard.module.css'

/**
 * Guards the five mutually exclusive content branches of App (issue #121):
 * error without cards / error over the last-known cards / loading / empty / cards.
 *
 * The empty state (Tech Debt #4: it gives --bg-elevated a role) is gated on `lastUpdated`, not
 * merely on `!loading`, because useTransit starts with loading = false: without that guard the
 * first paint - which happens before the fetch effect runs - would satisfy
 * `!loading && origins.length === 0` and flash the empty card at every visitor. The hook is mocked
 * so each branch, including that pre-fetch instant, can be driven exactly rather than raced.
 */

// vi.hoisted: vi.mock is lifted above the imports, so the spies it closes over must be created
// there too, or the factory would touch them in their temporal dead zone.
const { useTransit, useApiStatus } = vi.hoisted(() => ({
  useTransit: vi.fn(),
  useApiStatus: vi.fn(),
}))

vi.mock('../src/hooks/useTransit', () => ({ useTransit, useApiStatus }))

import App from '../src/App'

type TransitState = {
  origins: OriginResult[]
  fastestOrigin: string | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Default is the settled-with-no-results state; each test overrides only what it cares about. */
function mockTransit(state: Partial<TransitState> = {}) {
  useTransit.mockReturnValue({
    origins: [],
    generatedAt: null,
    fastestOrigin: null,
    loading: false,
    error: null,
    lastUpdated: new Date('2026-07-13T09:00:00Z'),
    refresh: vi.fn(),
    ...state,
  })
}

/** One origin with one 18:49 candidate. A function, so the fixture helpers below are initialised. */
function oneCard(): OriginResult[] {
  return [originResult('六本木一丁目', [candidate('18:49', '19:38', true)])]
}

const EMPTY = 'No departures found'
const LOADING = 'Loading transit information...'
const ERROR = 'サーバーに接続できません'
// lastUpdated 2026-07-13T09:00:00Z is 18:00 JST.
const DATA_TIME = '表示中は 18:00 時点のデータです'
const RAW_ERROR = 'HTTP error: 500'

beforeEach(() => {
  vi.clearAllMocks()
  useApiStatus.mockReturnValue('ok')
})

describe('App content branches', () => {
  it('error without prior data: banner + 再試行 only, no cards, no empty state', () => {
    mockTransit({ error: RAW_ERROR, lastUpdated: null })
    const { container } = render(<App />)

    expect(screen.getByRole('alert').textContent).toContain(ERROR)
    expect(screen.queryByText(DATA_TIME)).toBeNull()
    expect(screen.getByRole('button', { name: '再試行' })).toBeDefined()
    expect(container.querySelector(`.${cardStyles.card}`)).toBeNull()
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(screen.queryByText(LOADING)).toBeNull()
  })

  it('error with prior data: keeps the last-known cards visible under the banner', () => {
    mockTransit({ origins: oneCard(), error: RAW_ERROR })
    render(<App />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(ERROR)
    expect(alert.textContent).toContain(DATA_TIME)
    expect(screen.getByText('18:49')).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(screen.queryByText(LOADING)).toBeNull()
  })

  it('loading: spinner only, no empty state', () => {
    mockTransit({ loading: true, lastUpdated: null })
    render(<App />)

    expect(screen.getByText(LOADING)).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('empty: shows the empty state once a fetch has settled with no origins', () => {
    mockTransit()
    render(<App />)

    expect(screen.getByText(EMPTY)).toBeDefined()
    expect(screen.queryByText(LOADING)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('normal: shows cards and no status branch when candidates are present', () => {
    mockTransit({ origins: oneCard() })
    render(<App />)

    expect(screen.getByText('18:49')).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
    expect(screen.queryByText(LOADING)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not flash the empty state before the first fetch completes', () => {
    // The exact pre-fetch instant: loading is still false (its initial value) and no fetch has
    // ever landed. Only the lastUpdated guard suppresses the empty card here.
    mockTransit({ loading: false, lastUpdated: null })
    render(<App />)

    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('never renders the raw error message from the hook', () => {
    mockTransit({ origins: oneCard(), error: RAW_ERROR })
    const { container } = render(<App />)

    expect(container.textContent).not.toContain(RAW_ERROR)
  })

  it('wires 再試行 to refresh and parks focus on <main> before the banner unmounts', () => {
    mockTransit({ error: RAW_ERROR })
    const { container } = render(<App />)

    const retry = screen.getByRole('button', { name: '再試行' })
    retry.focus()
    fireEvent.click(retry)
    expect(useTransit.mock.results[0].value.refresh).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(container.querySelector('main'))
  })

  it('announces the empty and error states to assistive tech', () => {
    mockTransit()
    const { unmount } = render(<App />)
    expect(screen.getByRole('status').textContent).toContain(EMPTY)
    unmount()

    mockTransit({ error: RAW_ERROR })
    render(<App />)
    expect(screen.getByRole('alert').textContent).toContain(ERROR)
  })
})

/**
 * App -> StatusIndicator wiring (issue #121). lastUpdated in mockTransit() is fixed in the past, so
 * against the real shared clock the data is always >= 180 s old and the stale pill is up.
 */
describe('App stale-data pill wiring', () => {
  it('wires the 更新 button to refresh and parks focus on <main>', () => {
    mockTransit({ origins: oneCard() })
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(useTransit.mock.results[0].value.refresh).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(container.querySelector('main'))
  })

  it('passes loading through as refreshing (更新 disabled and busy while a fetch is in flight)', () => {
    mockTransit({ origins: oneCard(), loading: true })
    render(<App />)

    const button = screen.getByRole('button', { name: '更新' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('App accessibility affordances', () => {
  it('keeps the branch container a polite live region so a swapped branch is announced', () => {
    // The status branches are condition-mounted siblings; only a container that outlives them can
    // announce the swap, so the live region lives on .content, not on the branch nodes.
    mockTransit()
    const { container } = render(<App />)

    const live = container.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live!.textContent).toContain(EMPTY)
  })

  it('renders a Tray glyph in the empty card, not the error red', () => {
    mockTransit()
    const { container } = render(<App />)

    const emptyCard = screen.getByRole('status')
    // Phosphor renders an <svg>; the icon is decorative next to the microcopy.
    expect(emptyCard.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('marks the refresh button busy only while a fetch is in flight', () => {
    mockTransit({ loading: true, lastUpdated: null })
    const { unmount } = render(<App />)
    expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('aria-busy')).toBe('true')
    unmount()

    mockTransit()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Refresh' }).getAttribute('aria-busy')).toBe('false')
  })

})

/** Structured-origin fixtures (ADR 0006 D-2). Clock times are JST on 2026-10-07. */
const at = (hhmm: string) => `2026-10-07T${hhmm}:00+09:00`

function candidate(departure: string, arrival: string, isFastest = false): Candidate {
  const station = (name: string) => ({
    station: name,
    arrivalPlatform: null,
    departurePlatform: null,
    transferMinutes: null,
    waitMinutes: null,
    noAlight: false,
  })
  return {
    departureAt: at(departure),
    arrivalAt: at(arrival),
    durationMinutes: 45,
    transferCount: 1,
    isFastest,
    isFewestTransfers: isFastest,
    stops: [station('六本木一丁目'), station('つつじヶ丘')],
    legs: [
      {
        lineName: '東京メトロ南北線',
        lineCode: 'N',
        trainType: null,
        via: null,
        destination: null,
        departAt: at(departure),
        arriveAt: at(arrival),
        minutes: 45,
        distanceKm: null,
        carPosition: null,
      },
    ],
  }
}

function originResult(
  origin: string,
  candidates: Candidate[],
  status: OriginResult['status'] = candidates.length > 0 ? 'ok' : 'no_candidates',
  walkMinutes = 4
): OriginResult {
  return { origin, walkMinutes, searchedFrom: at('18:44'), status, candidates }
}

const ROPPONGI = '六本木一丁目'
const KAMIYACHO = '神谷町'
const AZABU = '麻布十番'

/** 神谷町 arrives first (19:30), 六本木一丁目 8 minutes later, 麻布十番 failed. */
const ORIGINS: OriginResult[] = [
  originResult(ROPPONGI, [candidate('18:49', '19:38', true), candidate('19:04', '19:52')]),
  originResult(KAMIYACHO, [candidate('18:52', '19:30', true)], 'ok', 7),
  originResult(AZABU, [], 'error', 11),
]

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) })

describe('station tabs (issue #122, ADR 0007 D-2)', () => {
  const ORIGINAL_TITLE = 'Transit - 六本木一丁目 → つつじヶ丘'

  beforeEach(() => {
    // Pin the clock: nothing on this path may depend on the wall clock or the runtime time zone.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(at('18:40')) })
    document.title = ORIGINAL_TITLE
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the origins as a tablist with aria-selected and a roving tabindex, not aria-pressed', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO })
    const { container } = render(<App />)

    expect(screen.getByRole('tablist', { name: '出発駅' })).toBeDefined()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(tabs.map(t => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
    expect(container.querySelector('[aria-pressed]')).toBeNull()

    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-labelledby')).toBe(tab(KAMIYACHO).id)
    expect(tabs.every(t => t.getAttribute('aria-controls') === panel.id)).toBe(true)
  })

  it('auto-selects fastestOrigin, not the first origin', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO })
    render(<App />)

    expect(tab(KAMIYACHO).getAttribute('aria-selected')).toBe('true')
    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByText('18:52')).toBeDefined()
  })

  it('selects the first origin when fastestOrigin is null', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: null })
    render(<App />)

    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('true')
  })

  it('summarises each tab: HH:MM着 + 最速 / +N分, 取得できず on error, 便なし on no_candidates', () => {
    mockTransit({
      origins: [...ORIGINS, originResult('溜池山王', [], 'no_candidates')],
      fastestOrigin: KAMIYACHO,
    })
    render(<App />)

    expect(tab(KAMIYACHO).textContent).toBe(`${KAMIYACHO}19:30着 最速`)
    expect(tab(ROPPONGI).textContent).toBe(`${ROPPONGI}19:38着 +8分`)
    expect(tab(AZABU).textContent).toBe(`${AZABU}取得できず`)
    expect(tab('溜池山王').textContent).toBe('溜池山王便なし')
  })

  it('holds a manual pick until the next successful fetch, which re-selects the fastest origin', () => {
    const fetched = new Date(at('18:40'))
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched })
    const { rerender } = render(<App />)

    fireEvent.click(tab(ROPPONGI))
    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('true')

    // A refetch in flight and then a failed one keep lastUpdated, so the pick holds.
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched, loading: true })
    rerender(<App />)
    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('true')
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched, error: RAW_ERROR })
    rerender(<App />)
    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('true')

    // The next successful fetch moves lastUpdated and releases the pick.
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: new Date(at('18:41')) })
    rerender(<App />)
    expect(tab(KAMIYACHO).getAttribute('aria-selected')).toBe('true')
    expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('false')
  })

  it('moves selection and focus with the arrow keys, wrapping, plus Home and End', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: ROPPONGI })
    render(<App />)
    const selected = () => screen.getAllByRole('tab').find(t => t.getAttribute('aria-selected') === 'true')

    tab(ROPPONGI).focus()
    fireEvent.keyDown(tab(ROPPONGI), { key: 'ArrowRight' })
    expect(selected()).toBe(tab(KAMIYACHO))
    expect(document.activeElement).toBe(tab(KAMIYACHO))

    fireEvent.keyDown(tab(KAMIYACHO), { key: 'End' })
    expect(selected()).toBe(tab(AZABU))
    fireEvent.keyDown(tab(AZABU), { key: 'ArrowRight' })
    expect(selected()).toBe(tab(ROPPONGI))
    fireEvent.keyDown(tab(ROPPONGI), { key: 'ArrowLeft' })
    expect(selected()).toBe(tab(AZABU))
    expect(document.activeElement).toBe(tab(AZABU))
    fireEvent.keyDown(tab(AZABU), { key: 'Home' })
    expect(selected()).toBe(tab(ROPPONGI))
    expect(tab(ROPPONGI).getAttribute('tabindex')).toBe('0')
  })

  it('leaves modified arrow keys (e.g. Alt+ArrowLeft, browser Back) to the browser', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: ROPPONGI })
    render(<App />)

    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      const notCancelled = fireEvent.keyDown(tab(ROPPONGI), { key: 'ArrowLeft', [modifier]: true })
      expect(notCancelled).toBe(true)
      expect(tab(ROPPONGI).getAttribute('aria-selected')).toBe('true')
    }
  })

  it('titles the page after the active origin and its fastest departure, and restores it on unmount', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO })
    const { unmount } = render(<App />)
    expect(document.title).toBe('神谷町 → つつじヶ丘 · 18:52発')

    fireEvent.click(tab(ROPPONGI))
    expect(document.title).toBe('六本木一丁目 → つつじヶ丘 · 18:49発')

    // An origin with no candidate names no departure time.
    fireEvent.click(tab(AZABU))
    expect(document.title).toBe('麻布十番 → つつじヶ丘')

    unmount()
    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('leaves the title alone before any origin has loaded', () => {
    mockTransit({ lastUpdated: null, loading: true })
    render(<App />)

    expect(document.title).toBe(ORIGINAL_TITLE)
  })

  it('shows the context line for the active origin', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO })
    render(<App />)

    expect(screen.getByText('オフィスから徒歩7分 · 到着が早い順')).toBeDefined()
    fireEvent.click(tab(ROPPONGI))
    expect(screen.getByText('オフィスから徒歩4分 · 到着が早い順')).toBeDefined()
  })

  it('names the active origin\'s own outcome in the empty card and drops the ordering note', () => {
    mockTransit({ origins: [...ORIGINS, originResult('溜池山王', [], 'no_candidates')], fastestOrigin: KAMIYACHO })
    render(<App />)

    fireEvent.click(tab(AZABU))
    expect(screen.getByRole('status').textContent).toBe('取得できず')
    expect(screen.queryByText(/到着が早い順/)).toBeNull()

    fireEvent.click(tab('溜池山王'))
    expect(screen.getByRole('status').textContent).toBe('便なし')
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('keeps a card-less tab\'s outcome, not the first-load spinner, while a refresh is in flight', () => {
    const fetched = new Date(at('18:40'))
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched })
    const { rerender } = render(<App />)
    fireEvent.click(tab(AZABU))

    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched, loading: true })
    rerender(<App />)
    expect(screen.queryByText(LOADING)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('取得できず')

    // A failed refresh still dates the data the other tabs show.
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO, lastUpdated: fetched, error: RAW_ERROR })
    rerender(<App />)
    expect(screen.getByRole('alert').textContent).toContain('表示中は 18:40 時点のデータです')
  })

  it('counts each card down with its own origin\'s walk minutes (issue #123)', () => {
    // Same 18:49 departure, same 18:40 clock: only walkMinutes differs, so the badges must too.
    mockTransit({
      origins: [
        originResult(ROPPONGI, [candidate('18:49', '19:38', true)], 'ok', 4),
        originResult(KAMIYACHO, [candidate('18:49', '19:30', true)], 'ok', 9),
      ],
      fastestOrigin: ROPPONGI,
    })
    render(<App />)

    expect(screen.getByText('あと5分で出る')).toBeDefined()
    fireEvent.click(tab(KAMIYACHO))
    expect(screen.getByText('今すぐ出発')).toBeDefined()
    expect(screen.queryByText('あと5分で出る')).toBeNull()
  })
})

/**
 * The fastest-arrival marker (ADR 0006 D-4 amends ADR 0004 D-3): the keyline marks the server's
 * per-origin `isFastest` candidate - still derived from data, never from card position.
 */
describe('fastest-arrival marker', () => {
  /** The visible marker: cards carrying the .cardNext keyline modifier. */
  function markedCards(container: HTMLElement): Element[] {
    return [...container.querySelectorAll(`.${cardStyles.cardNext}`)]
  }

  /** The accessible marker: the visually-hidden text equivalent of the keyline. */
  function markerLabels(): HTMLElement[] {
    return screen.queryAllByText(/最速の便/)
  }

  it('marks the isFastest candidate, not the first card', () => {
    mockTransit({
      origins: [originResult(ROPPONGI, [candidate('18:40', '19:45'), candidate('18:49', '19:38', true)])],
      fastestOrigin: ROPPONGI,
    })
    const { container } = render(<App />)

    const marked = markedCards(container)
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('18:49')
    expect(marked[0].textContent).not.toContain('18:40')
    expect(markerLabels()).toHaveLength(1)
  })

  it('gives the marker a text equivalent inside the marked card header', () => {
    mockTransit({ origins: ORIGINS, fastestOrigin: KAMIYACHO })
    render(<App />)

    // The keyline is a pseudo-element, invisible to assistive tech; the hidden text is what
    // reaches a screen reader, so it must live in the header button's accessible name.
    const header = screen.getByRole('button', { name: /最速の便/ })
    expect(header.textContent).toContain('18:52')
    expect(header.querySelector('.visually-hidden')).not.toBeNull()
  })

  it('marks nothing in the empty state or on a failed origin', () => {
    mockTransit()
    const empty = render(<App />)
    expect(markedCards(empty.container)).toHaveLength(0)
    empty.unmount()

    mockTransit({ origins: [originResult(AZABU, [], 'error')], fastestOrigin: null })
    const failed = render(<App />)
    expect(markedCards(failed.container)).toHaveLength(0)
    expect(markerLabels()).toHaveLength(0)
  })

  it('keeps the expanded card and the marker on the same train after a tab switch', () => {
    // 六本木一丁目's marker sits at index 0, 神谷町's at index 1. React reuses component
    // instances by key, so with a positional key (key={index}) the first tab's expansion state
    // would survive the switch on card 0 while the marker moves to card 1.
    mockTransit({
      origins: [
        originResult(ROPPONGI, [candidate('18:49', '19:38', true), candidate('19:04', '19:52')]),
        originResult(KAMIYACHO, [candidate('18:45', '19:40'), candidate('18:55', '19:39', true)]),
      ],
      fastestOrigin: ROPPONGI,
    })
    render(<App />)

    fireEvent.click(tab(KAMIYACHO))

    const marked = screen.getByRole('button', { name: /最速の便/ })
    expect(marked.textContent).toContain('18:55')
    expect(marked.getAttribute('aria-expanded')).toBe('true')

    const headers = screen.getAllByRole('button').filter(button => button.hasAttribute('aria-expanded'))
    expect(headers).toHaveLength(2)
    const unmarked = headers.find(button => button !== marked)
    expect(unmarked?.getAttribute('aria-expanded')).toBe('false')
  })
})
