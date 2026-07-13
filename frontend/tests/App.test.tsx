import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { OriginRoute } from '../src/types/transit'

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
