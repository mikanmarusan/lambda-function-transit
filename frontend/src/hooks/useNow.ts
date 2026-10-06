import { useSyncExternalStore } from 'react'

// One app-wide clock: every useNow() caller shares a single setInterval, which
// runs only while at least one component is subscribed. Reading the clock goes
// through useSyncExternalStore, so no component calls Date.now() during render.

export const NOW_TICK_MS = 1_000

const listeners = new Set<() => void>()
let now = Date.now()
let interval: ReturnType<typeof setInterval> | null = null

function sample() {
  now = Date.now()
  listeners.forEach((listener) => listener())
}

// Timers are throttled or frozen in a background tab, so re-sample as soon as
// the page becomes visible again instead of waiting for the next tick.
function onVisibilityChange() {
  if (document.visibilityState === 'visible') sample()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    interval = setInterval(sample, NOW_TICK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      if (interval !== null) clearInterval(interval)
      interval = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

const getSnapshot = () => now

/** Current epoch milliseconds, updated every `NOW_TICK_MS` and on returning to the tab. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
