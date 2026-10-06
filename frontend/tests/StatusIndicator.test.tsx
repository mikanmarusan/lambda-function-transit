import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * The header freshness indicator (issue #121, ADR 0007 D-2): a quiet dot plus 「N秒前に更新」 /
 * 「N分前に更新」, turning into an amber 「N分前のデータ」 pill with an 更新 button once the data is
 * 180 s old or older. The clock is mocked so the 179 s / 180 s boundary is driven exactly.
 */

const clock = vi.hoisted(() => ({ now: 0 }))
vi.mock('../src/hooks/useNow', () => ({ useNow: () => clock.now }))

import { StatusIndicator } from '../src/components/StatusIndicator'

const UPDATED = new Date('2026-07-13T09:00:00Z')
const SEC = 1_000

function renderAt(
  elapsedMs: number,
  props: Partial<Parameters<typeof StatusIndicator>[0]> = {}
) {
  clock.now = UPDATED.getTime() + elapsedMs
  const onRefresh = vi.fn()
  const utils = render(
    <StatusIndicator status="ok" lastUpdated={UPDATED} onRefresh={onRefresh} refreshing={false} {...props} />
  )
  return { ...utils, onRefresh }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StatusIndicator freshness', () => {
  it('reads N秒前に更新 under a minute', () => {
    renderAt(30 * SEC)
    expect(screen.getByText('30秒前に更新')).toBeDefined()
  })

  it('reads N分前に更新 from one minute on', () => {
    renderAt(120 * SEC)
    expect(screen.getByText('2分前に更新')).toBeDefined()
  })

  it('is still fresh at 179 s: no stale pill, no 更新 button', () => {
    renderAt(179 * SEC)
    expect(screen.getByText('2分前に更新')).toBeDefined()
    expect(screen.queryByText(/のデータ$/)).toBeNull()
    expect(screen.queryByRole('button', { name: '更新' })).toBeNull()
  })

  it('turns into the amber stale pill with an 更新 button at exactly 180 s', () => {
    renderAt(180 * SEC)
    expect(screen.getByText('3分前のデータ')).toBeDefined()
    expect(screen.queryByText(/に更新$/)).toBeNull()
    expect(screen.getByRole('button', { name: '更新' })).toBeDefined()
  })

  it('wires the 更新 button to refresh', () => {
    const { onRefresh } = renderAt(600 * SEC)
    fireEvent.click(screen.getByRole('button', { name: '更新' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('disables the 更新 button while a fetch is in flight', () => {
    renderAt(600 * SEC, { refreshing: true })
    const button = screen.getByRole('button', { name: '更新' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  it('shows no freshness text before the first successful fetch', () => {
    renderAt(0, { lastUpdated: null })
    expect(screen.queryByText(/に更新$/)).toBeNull()
    expect(screen.queryByText(/のデータ$/)).toBeNull()
  })
})

describe('StatusIndicator status dot', () => {
  it.each([
    ['ok', 'サーバー接続: 正常'],
    ['error', 'サーバー接続: エラー'],
    ['loading', 'サーバー接続: 確認中'],
  ] as const)('gives the %s dot a hidden text equivalent (%s)', (status, label) => {
    const { container } = renderAt(30 * SEC, { status })
    expect(screen.getByText(label).className).toBe('visually-hidden')
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('no longer renders the English Connected / Updated copy', () => {
    const { container } = renderAt(30 * SEC)
    expect(container.textContent).not.toMatch(/Connected|Connecting|Updated|Error/)
  })
})
