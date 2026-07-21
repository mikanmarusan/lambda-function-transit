import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { OriginRoute } from '../src/types/transit'
import cardStyles from '../src/components/TransitCard.module.css'

/**
 * Guards the four mutually exclusive content branches of App: error / loading / empty / cards.
 *
 * The empty state (Tech Debt #4: it gives --bg-elevated a role) is the branch worth pinning.
 * It is gated on `lastUpdated`, not merely on `!loading`, because useTransit starts with
 * loading = false: without that guard the first paint - which happens before the fetch effect
 * runs - would satisfy `!loading && routes.length === 0` and flash "No departures found" at
 * every visitor. The hook is mocked so each branch, including that pre-fetch instant, can be
 * driven exactly rather than raced.
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
  originRoutes: OriginRoute[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Default is the settled-with-no-results state; each test overrides only what it cares about. */
function mockTransit(state: Partial<TransitState> = {}) {
  useTransit.mockReturnValue({
    originRoutes: [],
    loading: false,
    error: null,
    lastUpdated: new Date('2026-07-13T09:00:00Z'),
    refresh: vi.fn(),
    ...state,
  })
}

const routes: OriginRoute[] = [
  {
    origin: '六本木一丁目',
    destination: 'つつじヶ丘',
    transfers: [{ summary: '18:49発 → 19:38着(49分)(1回)', route: '■六本木一丁目\n｜東京メトロ南北線' }],
  },
]

const EMPTY = 'No departures found'
const LOADING = 'Loading transit information...'
const ERROR = 'Failed to load transit information'

beforeEach(() => {
  vi.clearAllMocks()
  useApiStatus.mockReturnValue('ok')
})

describe('App content branches', () => {
  it('shows the empty state once a fetch has settled with no routes', () => {
    mockTransit()
    render(<App />)

    expect(screen.getByText(EMPTY)).toBeDefined()
    expect(screen.queryByText(LOADING)).toBeNull()
    expect(screen.queryByText(ERROR)).toBeNull()
  })

  it('does not flash the empty state before the first fetch completes', () => {
    // The exact pre-fetch instant: loading is still false (its initial value) and no fetch has
    // ever landed. Only the lastUpdated guard suppresses the empty card here.
    mockTransit({ loading: false, lastUpdated: null })
    render(<App />)

    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('does not show the empty state while loading', () => {
    mockTransit({ loading: true, lastUpdated: null })
    render(<App />)

    expect(screen.getByText(LOADING)).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('does not show the empty state on error, even after a prior successful fetch', () => {
    mockTransit({ error: 'HTTP error: 500' })
    render(<App />)

    expect(screen.getByText(ERROR)).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('shows cards and no empty state when routes are present', () => {
    mockTransit({ originRoutes: routes })
    render(<App />)

    expect(screen.getByText('18:49')).toBeDefined()
    expect(screen.queryByText(EMPTY)).toBeNull()
  })

  it('announces the empty and error states to assistive tech', () => {
    mockTransit()
    const { unmount } = render(<App />)
    expect(screen.getByRole('status').textContent).toContain(EMPTY)
    unmount()

    mockTransit({ error: 'HTTP error: 500' })
    render(<App />)
    expect(screen.getByRole('alert').textContent).toContain(ERROR)
  })
})

describe('App accessibility affordances', () => {
  it('keeps the branch container a polite live region so a swapped branch is announced', () => {
    // The four branches are condition-mounted siblings; only a container that outlives them can
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

  it('exposes tab selection through aria-pressed', () => {
    mockTransit({
      originRoutes: [
        ...routes,
        { origin: '東京', destination: 'つつじヶ丘', transfers: [] },
      ],
    })
    render(<App />)

    expect(screen.getByRole('button', { name: '六本木一丁目' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '東京' }).getAttribute('aria-pressed')).toBe('false')
  })
})

/**
 * The next-departure marker (issue #97, ADR 0004 D-3). The backend slices Jorudan's candidates
 * with no sort and Jorudan ranks by route quality, so "card index 0" does NOT mean "soonest" -
 * these tests pin the marker to the departure-time data, and the first test below is the one
 * that kills a regression back to `index === 0` (which every position-based test would miss).
 */
describe('next-departure marker', () => {
  const ROUTE_BODY = '■六本木一丁目\n｜東京メトロ南北線'

  function transfer(summary: string) {
    return { summary, route: ROUTE_BODY }
  }

  function origin(name: string, summaries: string[]): OriginRoute {
    return { origin: name, destination: 'つつじヶ丘', transfers: summaries.map(transfer) }
  }

  /** The visible marker: cards carrying the .cardNext keyline modifier. */
  function markedCards(container: HTMLElement): Element[] {
    return [...container.querySelectorAll(`.${cardStyles.cardNext}`)]
  }

  /** The accessible marker: the visually-hidden text equivalent of the keyline. */
  function markerLabels(): HTMLElement[] {
    return screen.queryAllByText(/Next departure/)
  }

  it('marks the earliest departure, not the first card, when Jorudan ranks a later train first', () => {
    mockTransit({
      originRoutes: [origin('六本木一丁目', ['19:04発 → 19:52着(48分)(1回)', '18:49発 → 19:38着(49分)(1回)'])],
    })
    const { container } = render(<App />)

    const marked = markedCards(container)
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('18:49')
    expect(marked[0].textContent).not.toContain('19:04')
  })

  it('marks exactly one card whenever at least one card renders', () => {
    mockTransit({ originRoutes: [origin('六本木一丁目', ['18:49発 → 19:38着(49分)(1回)'])] })
    const single = render(<App />)
    expect(markedCards(single.container)).toHaveLength(1)
    single.unmount()

    mockTransit({
      originRoutes: [origin('六本木一丁目', ['19:04発 → 19:52着(48分)(1回)', '18:49発 → 19:38着(49分)(1回)'])],
    })
    const double = render(<App />)
    expect(markedCards(double.container)).toHaveLength(1)
    expect(markerLabels()).toHaveLength(1)
  })

  it('marks the first card on a departure-time tie', () => {
    mockTransit({
      originRoutes: [origin('六本木一丁目', ['18:49発 → 19:38着(49分)(1回)', '18:49発 → 19:45着(56分)(0回)'])],
    })
    const { container } = render(<App />)

    const marked = markedCards(container)
    expect(marked).toHaveLength(1)
    expect(marked[0].textContent).toContain('19:38')
  })

  it('marks nothing when any departure time failed to parse', () => {
    // A string compare would put '--:--' before every digit and falsely win; the guard
    // must drop the marker entirely instead.
    mockTransit({
      originRoutes: [origin('六本木一丁目', ['18:49発 → 19:38着(49分)(1回)', 'no parsable times here'])],
    })
    const { container } = render(<App />)

    expect(markedCards(container)).toHaveLength(0)
    expect(markerLabels()).toHaveLength(0)
  })

  it('marks nothing when the times are more than 6 hours apart (suspected midnight wrap)', () => {
    mockTransit({
      originRoutes: [origin('六本木一丁目', ['23:58発 → 0:45着(47分)(1回)', '0:12発 → 0:58着(46分)(1回)'])],
    })
    const { container } = render(<App />)

    expect(markedCards(container)).toHaveLength(0)
    expect(markerLabels()).toHaveLength(0)
  })

  it('marks nothing in the empty and error states', () => {
    mockTransit()
    const empty = render(<App />)
    expect(markedCards(empty.container)).toHaveLength(0)
    expect(markerLabels()).toHaveLength(0)
    empty.unmount()

    mockTransit({ error: 'HTTP error: 500' })
    const errored = render(<App />)
    expect(markedCards(errored.container)).toHaveLength(0)
    expect(markerLabels()).toHaveLength(0)
  })

  it('gives the marker a text equivalent inside the marked card header', () => {
    mockTransit({ originRoutes: [origin('六本木一丁目', ['18:49発 → 19:38着(49分)(1回)'])] })
    render(<App />)

    // The keyline is a pseudo-element, invisible to assistive tech; the hidden text is what
    // reaches a screen reader, so it must live in the header button's accessible name.
    const header = screen.getByRole('button', { name: /Next departure/ })
    expect(header.textContent).toContain('18:49')
    expect(header.querySelector('.visually-hidden')).not.toBeNull()
  })

  it('keeps the expanded card and the marker on the same train after a tab switch', () => {
    // Tab A's marker sits at index 0, tab B's at index 1. React reuses component instances
    // by key, so with a positional key (key={index}) tab A's expansion state would survive
    // the switch on card 0 while the marker moves to card 1 - this test goes red if the
    // key ever reverts to the index.
    mockTransit({
      originRoutes: [
        origin('六本木一丁目', ['18:49発 → 19:38着(49分)(1回)', '19:04発 → 19:52着(48分)(1回)']),
        origin('東京', ['19:10発 → 19:58着(48分)(1回)', '18:55発 → 19:40着(45分)(1回)']),
      ],
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '東京' }))

    const marked = screen.getByRole('button', { name: /Next departure/ })
    expect(marked.textContent).toContain('18:55')
    expect(marked.getAttribute('aria-expanded')).toBe('true')

    // The unmarked card remounted collapsed - stale expansion did not leak across the tabs.
    const headers = screen.getAllByRole('button').filter(button => button.hasAttribute('aria-expanded'))
    expect(headers).toHaveLength(2)
    const unmarked = headers.find(button => button !== marked)
    expect(unmarked?.getAttribute('aria-expanded')).toBe('false')
  })

  it('expands the marked card by default and collapses the rest', () => {
    mockTransit({
      originRoutes: [origin('六本木一丁目', ['19:04発 → 19:52着(48分)(1回)', '18:49発 → 19:38着(49分)(1回)'])],
    })
    render(<App />)

    const marked = screen.getByRole('button', { name: /Next departure/ })
    expect(marked.textContent).toContain('18:49')
    expect(marked.getAttribute('aria-expanded')).toBe('true')

    const headers = screen.getAllByRole('button').filter(button => button.hasAttribute('aria-expanded'))
    const unmarked = headers.find(button => button !== marked)
    expect(unmarked?.getAttribute('aria-expanded')).toBe('false')
  })
})
