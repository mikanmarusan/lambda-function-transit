import { useState } from 'react'
import { ArrowRight, ArrowClockwise, Train, Spinner } from '@phosphor-icons/react'
import { useTransit, useApiStatus } from './hooks/useTransit'
import { TransitCard } from './components/TransitCard'
import { StatusIndicator } from './components/StatusIndicator'
import styles from './App.module.css'

function App() {
  const { originRoutes, loading, error, lastUpdated, refresh } = useTransit()
  const apiStatus = useApiStatus()

  const origins = originRoutes.map(r => r.origin)
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null)
  const activeOrigin = selectedOrigin ?? origins[0] ?? null
  const activeRoutes = originRoutes.find(r => r.origin === activeOrigin)?.transfers ?? []

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.titleGroup}>
            <Train size={20} weight="bold" className={styles.logo} />
            <h1 className={styles.title}>Transit</h1>
          </div>
          <StatusIndicator status={apiStatus} lastUpdated={lastUpdated} />
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.container}>
          <div className={styles.routeHeader}>
            <div className={styles.tabs}>
              {origins.map(origin => (
                <button
                  key={origin}
                  className={`${styles.tab} ${origin === activeOrigin ? styles.tabActive : ''}`}
                  onClick={() => setSelectedOrigin(origin)}
                >
                  {origin}
                </button>
              ))}
            </div>
            <button
              className={styles.refreshButton}
              onClick={refresh}
              disabled={loading}
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
            {error && (
              <div className={styles.error}>
                <span>Failed to load transit information</span>
              </div>
            )}

            {!error && activeRoutes.length === 0 && loading && (
              <div className={styles.loading}>
                <Spinner size={24} className={styles.spinner} />
                <span>Loading transit information...</span>
              </div>
            )}

            {!error && activeRoutes.length > 0 && (
              <div className={styles.cards}>
                {activeRoutes.map((route, index) => (
                  <TransitCard key={index} route={route} index={index} />
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
