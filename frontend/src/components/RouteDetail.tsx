import { parseRoute } from '../types/transit'
import styles from './RouteDetail.module.css'

interface RouteDetailProps {
  route: string
}

export function RouteDetail({ route }: RouteDetailProps) {
  const stations = parseRoute(route)

  if (stations.length === 0) {
    return (
      <div className={styles.container}>
        <pre className={styles.rawRoute}>{route}</pre>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.timeline}>
        {stations.map((item, index) => (
          <div key={index} className={styles.stop}>
            <div className={styles.marker}>
              <div className={styles.dot} />
              {index < stations.length - 1 && <div className={styles.line} />}
            </div>
            <div className={styles.content}>
              <span className={styles.station}>{item.station}</span>
              {item.line && (
                <span className={styles.lineName}>{item.line}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
