import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRight, ArrowClockwise, Train, Spinner, Tray } from '@phosphor-icons/react'
import { useTransit, useApiStatus } from './hooks/useTransit'
import { TransitCard } from './components/TransitCard'
import { StatusIndicator } from './components/StatusIndicator'
import { candidateToRoute, parseSummary, type Candidate, type OriginResult, type TransitRoute } from './types/transit'
import { formatClockTime } from './lib/time'
import styles from './App.module.css'

const DESTINATION = 'つつじヶ丘'
const MINUTE_MS = 60_000

/** An origin's earliest-arriving candidate, which the server flags `isFastest` (ADR 0006 D-2). */
function fastestCandidate(result: OriginResult | undefined): Candidate | null {
  return result?.candidates.find(candidate => candidate.isFastest) ?? null
}

/**
 * The summary line of a station tab: the origin's earliest arrival (`HH:MM着`) plus `最速` on
 * `fastestOrigin` or `+N分` behind it, or the per-origin outcome (ADR 0007 D-2).
 */
function tabSummary(result: OriginResult, fastestOrigin: string | null, fastestArrivalMs: number | null): string[] {
  if (result.status === 'error') return ['取得できず']
  const best = fastestCandidate(result)
  if (best === null) return ['便なし']
  const arrivalMs = Date.parse(best.arrivalAt)
  const arrival = `${formatClockTime(arrivalMs)}着`
  if (result.origin === fastestOrigin) return [arrival, '最速']
  if (fastestArrivalMs === null) return [arrival]
  return [arrival, `+${Math.max(0, Math.round((arrivalMs - fastestArrivalMs) / MINUTE_MS))}分`]
}

function App() {
  const { originRoutes, origins, fastestOrigin, loading, error, lastUpdated, refresh } = useTransit()
  const apiStatus = useApiStatus()

  // Tabs come from the structured `origins` (ADR 0006 D-2). While the legacy `routes` field still
  // ships (D-3), a structured part that failed validation leaves `origins` empty, so fall back to
  // the legacy origins rather than render no tabs at all.
  const structured = origins.length > 0
  const tabOrigins = structured ? origins.map(o => o.origin) : originRoutes.map(r => r.origin)

  // Selection: `fastestOrigin` by default (first tab when null). A manual pick is stamped with
  // the fetch it was made on and holds only while that is still the latest successful fetch -
  // `lastUpdated` changes on success alone, so the next successful fetch re-selects the fastest.
  // The stamp is the `lastUpdated` Date itself, compared by reference: each successful fetch
  // creates a new one, so even two fetches within one millisecond release the pick.
  const [pick, setPick] = useState<{ origin: string; fetchedAt: Date | null } | null>(null)
  const heldOrigin =
    pick !== null && pick.fetchedAt === lastUpdated && tabOrigins.includes(pick.origin) ? pick.origin : null
  const autoOrigin = fastestOrigin !== null && tabOrigins.includes(fastestOrigin) ? fastestOrigin : tabOrigins[0] ?? null
  const activeOrigin = heldOrigin ?? autoOrigin
  const selectOrigin = (origin: string) => setPick({ origin, fetchedAt: lastUpdated })

  const activeResult = origins.find(o => o.origin === activeOrigin)
  const activeFastest = fastestCandidate(activeResult)
  const fastestOriginCandidate = fastestCandidate(origins.find(o => o.origin === fastestOrigin))
  const fastestArrivalMs = fastestOriginCandidate ? Date.parse(fastestOriginCandidate.arrivalAt) : null

  // The keyline marks the server's `isFastest` candidate (ADR 0006 D-4), never a card position.
  // The legacy fallback carries no such flag, so it marks nothing. The cards keep the fetched
  // order: the per-second countdown inside each card never re-sorts or drops one.
  const cards: { route: TransitRoute; isNext: boolean; structured?: { candidate: Candidate; walkMinutes: number } }[] =
    structured
      ? (activeResult?.candidates ?? []).map(candidate => ({
          route: candidateToRoute(candidate),
          isNext: candidate.isFastest,
          structured: { candidate, walkMinutes: activeResult?.walkMinutes ?? 0 },
        }))
      : (originRoutes.find(r => r.origin === activeOrigin)?.transfers ?? []).map(route => ({ route, isNext: false }))
  // A fetch error does not hide the cards: useTransit keeps the last-known data on failure, so
  // they stay on screen under the error banner (ADR 0007 D-2).
  const hasCards = cards.length > 0
  // Whether any data is on screen at all - the tabs of another origin count, so a refresh on a
  // 便なし tab keeps that tab's outcome instead of the first-load spinner.
  const hasData = tabOrigins.length > 0
  // The empty card names the active origin's own outcome (ADR 0007 D-2) when it has one.
  const emptyMessage =
    activeResult?.status === 'error' ? '取得できず' : activeResult ? '便なし' : 'No departures found'

  // ADR 0007 D-3: the browser tab names the active origin and its fastest candidate's departure.
  const pageTitle =
    activeOrigin === null
      ? null
      : `${activeOrigin} → ${DESTINATION}${
          activeFastest ? ` · ${formatClockTime(Date.parse(activeFastest.departureAt))}発` : ''
        }`
  useEffect(() => {
    if (pageTitle === null) return
    const previous = document.title
    document.title = pageTitle
    return () => {
      document.title = previous
    }
  }, [pageTitle])

  const idPrefix = useId()
  const tabId = (index: number) => `${idPrefix}tab-${index}`
  const panelId = `${idPrefix}panel`
  const activeIndex = activeOrigin === null ? -1 : tabOrigins.indexOf(activeOrigin)

  // Arrow keys move selection and focus together (automatic activation); with a roving tabindex
  // only the selected tab sits in the Tab order.
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Leave modified arrows to the browser (Alt+ArrowLeft is Back, for one).
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')]
    const current = tabs.indexOf(event.target as HTMLElement)
    if (current === -1) return
    const last = tabs.length - 1
    let next: number
    switch (event.key) {
      case 'ArrowRight':
        next = current >= last ? 0 : current + 1
        break
      case 'ArrowLeft':
        next = current <= 0 ? last : current - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }
    event.preventDefault()
    selectOrigin(tabOrigins[next])
    tabs[next].focus()
  }

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
            <div className={styles.tabs} role="tablist" aria-label="出発駅" onKeyDown={onTabKeyDown}>
              {tabOrigins.map((origin, index) => {
                const selected = index === activeIndex
                const result = origins.find(o => o.origin === origin)
                const summary = result ? tabSummary(result, fastestOrigin, fastestArrivalMs) : []
                return (
                  <button
                    key={origin}
                    type="button"
                    role="tab"
                    id={tabId(index)}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
                    onClick={() => selectOrigin(origin)}
                  >
                    <span>{origin}</span>
                    {summary.length > 0 && <span className={styles.tabSummary}>{summary.join(' ')}</span>}
                  </button>
                )
              })}
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

          {/* One shared panel: its content follows the selected tab. Without tabs (before the first
              fetch, or a fetch with no origins) it is a plain wrapper, labelled by nothing. */}
          <div {...(activeIndex >= 0 ? { role: 'tabpanel', id: panelId, 'aria-labelledby': tabId(activeIndex) } : {})}>
            {activeOrigin && (
              <div className={styles.context}>
                <div className={styles.route}>
                  <span className={styles.station}>{activeOrigin}</span>
                  <ArrowRight size={16} className={styles.routeArrow} />
                  <span className={styles.station}>{DESTINATION}</span>
                </div>
                {activeResult && activeResult.candidates.length > 0 && (
                  <p className={styles.contextNote}>オフィスから徒歩{activeResult.walkMinutes}分 · 到着が早い順</p>
                )}
              </div>
            )}

            <div className={styles.content}>
              {/* Five mutually exclusive render branches, keyed off (error, hasCards, hasData,
                  loading, lastUpdated) - see docs/architecture.md "Frontend Render Branches":
                    error, no cards                   -> banner only
                    error, cards                      -> banner + the last-known cards (the hook keeps them)
                    no error, no data, busy           -> loading
                    no error, no cards, data or idle  -> empty (once a fetch has landed)
                    no error, cards                   -> cards
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
                      {hasData && lastUpdated && (
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

                {!error && !hasData && loading && (
                  <div className={styles.loading}>
                    <Spinner size={24} className={styles.spinner} />
                    <span>Loading transit information...</span>
                  </div>
                )}

                {/* Empty state. Gated on lastUpdated: it is set only by a completed fetch, so
                    the card cannot flash on the first paint (loading starts false). */}
                {!error && !hasCards && (hasData || !loading) && lastUpdated && (
                  <div className={styles.empty} role="status">
                    <Tray size={24} className={styles.emptyIcon} />
                    <span>{emptyMessage}</span>
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
                  {cards.map(({ route, isNext, structured: card }, index) => (
                    <TransitCard
                      key={`${activeOrigin}-${parseSummary(route.summary).departureTime}-${index}`}
                      route={route}
                      isNext={isNext}
                      structured={card}
                    />
                  ))}
                </div>
              )}
            </div>
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
