import { Circle } from '@phosphor-icons/react'
import { useNow } from '../hooks/useNow'
import { isStale, relativeTimeLabel } from '../lib/time'
import styles from './StatusIndicator.module.css'

interface StatusIndicatorProps {
  status: 'ok' | 'error' | 'loading'
  lastUpdated: Date | null
  onRefresh: () => void
  refreshing: boolean
}

/** The dot carries the API status by colour only, so each state also gets a hidden text equivalent. */
const STATUS_LABEL = {
  ok: 'サーバー接続: 正常',
  error: 'サーバー接続: エラー',
  loading: 'サーバー接続: 確認中',
} as const

const DOT_CLASS = {
  ok: styles.iconOk,
  error: styles.iconError,
  loading: styles.iconLoading,
} as const

export function StatusIndicator({ status, lastUpdated, onRefresh, refreshing }: StatusIndicatorProps) {
  const now = useNow()
  const updatedMs = lastUpdated?.getTime() ?? null
  const stale = updatedMs !== null && isStale(updatedMs, now)

  return (
    <div className={styles.container}>
      <Circle size={6} weight="fill" className={DOT_CLASS[status]} aria-hidden="true" />
      <span className="visually-hidden">{STATUS_LABEL[status]}</span>
      {updatedMs !== null &&
        (stale ? (
          <span className={styles.stale}>
            <span>{relativeTimeLabel(updatedMs, now)}のデータ</span>
            <button
              type="button"
              className={styles.staleRefresh}
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              更新
            </button>
          </span>
        ) : (
          <span className={styles.timestamp}>{relativeTimeLabel(updatedMs, now)}に更新</span>
        ))}
    </div>
  )
}
