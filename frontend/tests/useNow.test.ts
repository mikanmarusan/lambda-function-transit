import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNow, NOW_TICK_MS } from '../src/hooks/useNow'

const T0 = Date.parse('2026-10-06T20:40:00+09:00')

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current time and advances every tick', () => {
    const { result, unmount } = renderHook(() => useNow())
    expect(result.current).toBe(T0)
    act(() => {
      vi.advanceTimersByTime(NOW_TICK_MS)
    })
    expect(result.current).toBe(T0 + NOW_TICK_MS)
    unmount()
  })

  it('shares one interval across subscribers and clears it on the last unmount', () => {
    const a = renderHook(() => useNow())
    const b = renderHook(() => useNow())
    expect(vi.getTimerCount()).toBe(1)
    a.unmount()
    expect(vi.getTimerCount()).toBe(1)
    b.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('re-samples when the page becomes visible', () => {
    const { result, unmount } = renderHook(() => useNow())
    // A background tab may not have ticked; jump the clock without firing timers.
    vi.setSystemTime(T0 + 5 * 60_000)
    expect(result.current).toBe(T0)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(T0 + 5 * 60_000)
    unmount()
  })

  it('does not re-sample when the page becomes hidden', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const { result, unmount } = renderHook(() => useNow())
    vi.setSystemTime(T0 + 5 * 60_000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe(T0)
    unmount()
    visibility.mockRestore()
  })

  it('stops listening for visibilitychange after unmount', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useNow())
    unmount()
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    remove.mockRestore()
  })
})
