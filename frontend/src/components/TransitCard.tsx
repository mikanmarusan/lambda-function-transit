import { useState } from 'react'
import { Clock, ArrowsDownUp, CaretDown, CaretUp } from '@phosphor-icons/react'
import { TransitRoute, parseSummary } from '../types/transit'
import { RouteDetail } from './RouteDetail'
import styles from './TransitCard.module.css'

interface TransitCardProps {
  route: TransitRoute
  index: number
}

export function TransitCard({ route, index }: TransitCardProps) {
  const [expanded, setExpanded] = useState(index === 0)
  const summary = parseSummary(route.summary)

  return (
    <div className={styles.card}>
      <button
        className={styles.header}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
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
