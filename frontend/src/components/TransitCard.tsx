import { useState } from 'react'
import { Clock, ArrowsDownUp, CaretDown, CaretUp } from '@phosphor-icons/react'
import { TransitRoute, parseSummary } from '../types/transit'
import { RouteDetail } from './RouteDetail'
import styles from './TransitCard.module.css'

interface TransitCardProps {
  route: TransitRoute
  /** True on the earliest departure (derived from the data in App, never from card position). */
  isNext: boolean
}

export function TransitCard({ route, isNext }: TransitCardProps) {
  const [expanded, setExpanded] = useState(isNext)
  const summary = parseSummary(route.summary)

  return (
    <div className={`${styles.card} ${isNext ? styles.cardNext : ''}`}>
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* The keyline is a pseudo-element, invisible to assistive tech; this text is the
            marker's accessible equivalent. Global utility class, so no styles[...] here. */}
        {isNext && <span className="visually-hidden">Next departure </span>}
        <div className={styles.times}>
          <span className={styles.departure}>{summary.departureTime}</span>
          <span className={styles.arrow}>→</span>
          <span className={styles.arrival}>{summary.arrivalTime}</span>
        </div>
        <div className={styles.meta}>
          <span className={styles.badge}>
            <Clock size={12} weight="bold" />
            {summary.duration}
          </span>
          <span className={styles.badge}>
            <ArrowsDownUp size={12} weight="bold" />
            {summary.transfers}
          </span>
        </div>
        <div className={styles.expandIcon}>
          {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </div>
      </button>
      {expanded && (
        <div className={styles.body}>
          <RouteDetail route={route.route} />
        </div>
      )}
    </div>
  )
}
