import { Fragment, useState } from 'react'
import { CaretDown, CaretRight, CaretUp } from '@phosphor-icons/react'
import { TransitRoute, parseSummary, type Candidate } from '../types/transit'
import { useNow } from '../hooks/useNow'
import { leaveCountdown, minutesUntilLeave, type LeaveTone } from '../lib/time'
import { LinePill } from './LinePill'
import { RouteDetail } from './RouteDetail'
import styles from './TransitCard.module.css'

interface TransitCardProps {
  /** The legacy `[summary, route]` strings: the times, the duration and the expanded timeline. */
  route: TransitRoute
  /** True on the origin's earliest-arriving candidate (the server's `isFastest`, never a card position). */
  isNext: boolean
  /**
   * The structured candidate behind `route`, with its origin's walk minutes. It adds the
   * countdown badge, the 最速 / 乗換少 labels and the line pills; the legacy fallback has none.
   */
  structured?: { candidate: Candidate; walkMinutes: number }
}

const COUNTDOWN_CLASS: Record<LeaveTone, string> = {
  go: styles.countdownGo,
  now: styles.countdownNow,
  missed: styles.countdownMissed,
}

export function TransitCard({ route, isNext, structured }: TransitCardProps) {
  const [expanded, setExpanded] = useState(isNext)
  const now = useNow()
  const summary = parseSummary(route.summary)
  const candidate = structured?.candidate ?? null
  // Recomputed on every shared-clock tick; the card list itself is never re-sorted or pruned here.
  const minutes = structured ? minutesUntilLeave(structured.candidate.departureAt, structured.walkMinutes, now) : null
  const countdown = minutes === null ? null : leaveCountdown(minutes)

  return (
    <div className={`${styles.card} ${isNext ? styles.cardNext : ''}`}>
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* The keyline is a pseudo-element, invisible to assistive tech; this text is the
            marker's accessible equivalent. Global utility class, so no styles[...] here. */}
        {isNext && <span className="visually-hidden">最速の便 </span>}
        <span className={styles.summary}>
          <span className={styles.lead}>
            <span className={styles.departure}>{summary.departureTime}</span>
            {countdown && (
              <span className={`${styles.countdown} ${COUNTDOWN_CLASS[countdown.tone]}`}>{countdown.label}</span>
            )}
          </span>
          <span className={styles.meta}>
            <span className={styles.arrival}>{summary.arrivalTime}着</span>
            <span className={styles.duration}>
              {summary.duration} · 乗換{summary.transfers}
            </span>
            {candidate?.isFastest && <span className={`${styles.badge} ${styles.badgeFastest}`}>最速</span>}
            {candidate?.isFewestTransfers && <span className={styles.badge}>乗換少</span>}
          </span>
          {candidate && candidate.legs.length > 0 && (
            <span className={styles.lines}>
              {candidate.legs.map((leg, index) => (
                <Fragment key={index}>
                  {index > 0 && <CaretRight size={12} weight="bold" className={styles.chevron} aria-hidden />}
                  <LinePill lineCode={leg.lineCode} lineName={leg.lineName} />
                </Fragment>
              ))}
            </span>
          )}
        </span>
        <span className={styles.expandIcon}>
          {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </span>
      </button>
      {expanded && (
        <div className={styles.body}>
          <RouteDetail route={route.route} />
        </div>
      )}
    </div>
  )
}
