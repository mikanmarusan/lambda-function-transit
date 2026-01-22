import { Circle, Warning } from '@phosphor-icons/react'
import styles from './StatusIndicator.module.css'

interface StatusIndicatorProps {
  status: 'ok' | 'error' | 'loading'
  lastUpdated: Date | null
}

export function StatusIndicator({ status, lastUpdated }: StatusIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className={styles.container}>
      <div className={styles.status}>
        {status === 'ok' ? (
          <Circle weight="fill" className={styles.iconOk} />
        ) : status === 'error' ? (
          <Warning weight="fill" className={styles.iconError} />
        ) : (
          <Circle className={styles.iconLoading} />
        )}
        <span className={styles.label}>
          {status === 'ok' ? 'Connected' : status === 'error' ? 'Error' : 'Connecting'}
        </span>
      </div>
      {lastUpdated && (
        <span className={styles.timestamp}>
          Updated {formatTime(lastUpdated)}
        </span>
      )}
    </div>
  )
}
