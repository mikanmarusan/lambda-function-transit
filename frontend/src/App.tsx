import { useRef, useState } from 'react'
import { ArrowRight, ArrowClockwise, Train, Spinner, Tray } from '@phosphor-icons/react'
import { useTransit, useApiStatus } from './hooks/useTransit'
import { TransitCard } from './components/TransitCard'
import { StatusIndicator } from './components/StatusIndicator'
import { parseSummary } from './types/transit'
import { formatClockTime } from './lib/time'
import styles from './App.module.css'

/** Minutes since midnight for a strict `HH:MM` string; the caller filters `--:--` first. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Index of the candidate to run for -- the earliest departure -- or null to mark nothing.
 * Derived from the data, never from card position: the backend slices Jorudan's blocks with
 * no sort, and Jorudan ranks by route quality, so index 0 is not "soonest" (ADR 0004 D-3).
 * - Any `--:--` (failed parse) marks nothing: the string sorts before every digit and
 *   would falsely win.
 * - A spread over 6 hours suggests a midnight wrap ("23:58" vs "00:12"); marking either
 *   card would be a guess, so mark nothing.
 * - Ties mark the first (indexOf returns the first occurrence).
 */
function deriveNextIndex(departureTimes: string[]): number | null {
  if (departureTimes.length === 0) return null
  if (departureTimes.some(time => time === '--:--')) return null
  const minutes = departureTimes.map(toMinutes)
  if (Math.max(...minutes) - Math.min(...minutes) > 360) return null
  return minutes.indexOf(Math.min(...minutes))
}

function App() {
  const { originRoutes, loading, error, lastUpdated, refresh } = useTransit()
  const apiStatus = useApiStatus()

  const origins = originRoutes.map(r => r.origin)
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null)
  const activeOrigin = selectedOrigin ?? origins[0] ?? null
  const activeRoutes = originRoutes.find(r => r.origin === activeOrigin)?.transfers ?? []
  const departureTimes = activeRoutes.map(route => parseSummary(route.summary).departureTime)
  const nextIndex = deriveNextIndex(departureTimes)
  // A fetch error does not hide the cards: useTransit keeps the last-known originRoutes on
  // failure, so they stay on screen under the error banner (ADR 0007 D-2).
  const hasCards = activeRoutes.length > 0

  // 再試行 and 更新 both unmount on the next state change (useTransit clears `error` as a fetch
  // starts, and a successful fetch drops the stale pill), which would drop keyboard focus to
  // <body>. Park focus on <main> first so a keyboard or screen-reader user keeps their place.
  const mainRef = useRef<HTMLElement>(null)
  const refreshKeepingFocus = () => {
    mainRef.current?.focus({ preventScroll: true })
    refresh()
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.titleGroup}>
            <Train size={20} weight="bold" className={styles.logo} />
            <h1 className={styles.title}>Transit</h1>
          </div>
          <StatusIndicator
            status={apiStatus}
            lastUpdated={lastUpdated}
            onRefresh={refreshKeepingFocus}
            refreshing={loading}
          />
        </div>
      </header>

      <main className={styles.main} ref={mainRef} tabIndex={-1}>
        <div className={styles.container}>
          <div className={styles.routeHeader}>
            <div className={styles.tabs}>
              {origins.map(origin => (
                <button
                  key={origin}
                  className={`${styles.tab} ${origin === activeOrigin ? styles.tabActive : ''}`}
                  onClick={() => setSelectedOrigin(origin)}
                  aria-pressed={origin === activeOrigin}
                >
                  {origin}
                </button>
              ))}
            </div>
            <button
              className={styles.refreshButton}
              onClick={refresh}
              disabled={loading}
              aria-busy={loading}
              aria-label="Refresh"
            >
              {loading ? (
                <Spinner size={16} className={styles.spinner} />
              ) : (
                <ArrowClockwise size={16} />
              )}
            </button>
          </div>

          {activeOrigin && (
            <div className={styles.route}>
              <span className={styles.station}>{activeOrigin}</span>
              <ArrowRight size={16} className={styles.routeArrow} />
              <span className={styles.station}>つつじヶ丘</span>
            </div>
          )}

          <div className={styles.content}>
            {/* Five mutually exclusive render branches, keyed off (error, hasCards, loading,
                lastUpdated) - see docs/architecture.md "Frontend Render Branches":
                  error, no cards          -> banner only
                  error, cards             -> banner + the last-known cards (the hook keeps them)
                  no error, no cards, busy -> loading
                  no error, no cards, idle -> empty (once a fetch has landed)
                  no error, cards          -> cards
                The status branches are condition-mounted, so the live region has to be a container
                that outlives them - a role on the branch node itself is only announced by some AT.
                The cards deliberately live OUTSIDE this region: inside it, every tab switch would
                re-read the whole timetable. */}
            <div className={styles.status} aria-live="polite">
              {error && (
                <div className={styles.error} role="alert">
                  {/* Fixed copy only: the hook's error string (e.g. "HTTP error: 500") never renders. */}
                  <div className={styles.errorText}>
                    <span>サーバーに接続できません</span>
                    {hasCards && lastUpdated && (
                      <span className={styles.errorDetail}>
                        表示中は {formatClockTime(lastUpdated.getTime())} 時点のデータです
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={refreshKeepingFocus}
                  >
                    再試行
                  </button>
                </div>
              )}

              {!error && !hasCards && loading && (
                <div className={styles.loading}>
                  <Spinner size={24} className={styles.spinner} />
                  <span>Loading transit information...</span>
                </div>
              )}

              {/* Empty state. Gated on lastUpdated: it is set only by a completed fetch, so
                  the card cannot flash on the first paint (loading starts false). */}
              {!error && !hasCards && !loading && lastUpdated && (
                <div className={styles.empty} role="status">
                  <Tray size={24} className={styles.emptyIcon} />
                  <span>No departures found</span>
                </div>
              )}
            </div>

            {hasCards && (
              <div className={styles.cards}>
                {/* Key by the train's identity, not its position: React reuses instances by
                    key and useState initializers only run on mount, so a positional key would
                    leave a stale card expanded after a tab switch or refresh. The index
                    tiebreaker only guards against two candidates sharing a departure time
                    (duplicate keys); the origin + time prefix still forces the remount. */}
                {activeRoutes.map((route, index) => (
                  <TransitCard
                    key={`${activeOrigin}-${departureTimes[index]}-${index}`}
                    route={route}
                    isNext={index === nextIndex}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <span>Data from Jorudan</span>
      </footer>
    </div>
  )
}

export default App
