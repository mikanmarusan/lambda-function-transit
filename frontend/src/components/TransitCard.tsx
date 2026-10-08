import { Fragment, useState } from 'react'
import { CaretDown, CaretRight, CaretUp } from '@phosphor-icons/react'
import type { Candidate } from '../types/transit'
import { useNow } from '../hooks/useNow'
import { formatClockTime, formatDuration, leaveCountdown, minutesUntilLeave, type LeaveTone } from '../lib/time'
import { LinePill } from './LinePill'
import { RouteDetail } from './RouteDetail'
import styles from './TransitCard.module.css'

interface TransitCardProps {
  /** The structured candidate this card draws: its times, labels, line pills and `RouteDetail`. */
  candidate: Candidate
  /** Minutes from the office to the candidate's origin, which drive the leave-by countdown. */
  walkMinutes: number
  /** True on the origin's earliest-arriving candidate (the server's `isFastest`, never a card position). */
  isNext: boolean
}

const COUNTDOWN_CLASS: Record<LeaveTone, string> = {
  go: styles.countdownGo,
  now: styles.countdownNow,
  missed: styles.countdownMissed,
}

export function TransitCard({ candidate, walkMinutes, isNext }: TransitCardProps) {
  const [expanded, setExpanded] = useState(isNext)
  const now = useNow()
  // Recomputed on every shared-clock tick; the card list itself is never re-sorted or pruned here.
  const minutes = minutesUntilLeave(candidate.departureAt, walkMinutes, now)
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
            <span className={styles.departure}>{formatClockTime(Date.parse(candidate.departureAt))}</span>
            {countdown && (
              <span className={`${styles.countdown} ${COUNTDOWN_CLASS[countdown.tone]}`}>{countdown.label}</span>
            )}
          </span>
          <span className={styles.meta}>
            <span className={styles.arrival}>{formatClockTime(Date.parse(candidate.arrivalAt))}着</span>
            <span className={styles.duration}>
              {formatDuration(candidate.durationMinutes)} · 乗換{candidate.transferCount}回
            </span>
            {candidate.isFastest && <span className={`${styles.badge} ${styles.badgeFastest}`}>最速</span>}
            {candidate.isFewestTransfers && <span className={styles.badge}>乗換少</span>}
          </span>
          {candidate.legs.length > 0 && (
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
          <RouteDetail candidate={candidate} />
        </div>
      )}
    </div>
  )
}
