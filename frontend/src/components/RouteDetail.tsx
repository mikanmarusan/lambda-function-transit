import { Fragment } from 'react'
import { parseRoute, type Candidate, type Leg, type LineCode, type Stop } from '../types/transit'
import { formatClockTime } from '../lib/time'
import { LinePill } from './LinePill'
import styles from './RouteDetail.module.css'

interface RouteDetailProps {
  /** The legacy route string: drawn only when no structured `candidate` is given. */
  route: string
  /** The structured candidate behind `route`; when present it replaces the legacy timeline. */
  candidate?: Candidate
}

/**
 * The rail colour of each closed-set `lineCode` (ADR 0008 D-1). Each class sets `color` to its
 * line token and the rail paints with `currentColor`; no response string reaches `style`.
 */
const RAIL_CLASS: Record<LineCode, string> = {
  N: styles.railN,
  M: styles.railM,
  H: styles.railH,
  Z: styles.railZ,
  E: styles.railE,
  S: styles.railS,
  KO: styles.railKo,
}

const clock = (iso: string) => formatClockTime(Date.parse(iso))

function railClass(lineCode: LineCode | null): string {
  return lineCode !== null && Object.hasOwn(RAIL_CLASS, lineCode) ? RAIL_CLASS[lineCode] : styles.railNeutral
}

/** Train type, `<destination>行` and distance, skipping whichever the route did not carry. */
function legMeta(leg: Leg): string {
  return [
    leg.trainType,
    leg.destination === null ? null : `${leg.destination}行`,
    leg.distanceKm === null ? null : `${leg.distanceKm}km`,
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
}

/** A transfer stop's badges: 降車不要 for through-running, else 乗換 N分; 待ち N分, and 余裕なし at a 0-minute wait. */
function StopBadges({ stop }: { stop: Stop }) {
  const tight = stop.waitMinutes === 0 && !stop.noAlight
  if (!stop.noAlight && stop.transferMinutes === null && stop.waitMinutes === null) return null
  return (
    <span className={styles.badges}>
      {stop.noAlight ? (
        <span className={`${styles.badge} ${styles.badgeThrough}`}>降車不要</span>
      ) : (
        stop.transferMinutes !== null && <span className={styles.badge}>乗換 {stop.transferMinutes}分</span>
      )}
      {stop.waitMinutes !== null && <span className={styles.badge}>待ち {stop.waitMinutes}分</span>}
      {tight && <span className={`${styles.badge} ${styles.badgeTight}`}>余裕なし</span>}
    </span>
  )
}

/** The structured route as an ordered list: each stop with its times, then the leg leaving it. */
function StructuredRoute({ candidate }: { candidate: Candidate }) {
  const last = candidate.stops.length - 1
  return (
    <ol className={styles.route}>
      {candidate.stops.map((stop, index) => {
        const arriving = candidate.legs[index - 1]
        const leaving = candidate.legs[index]
        const terminal = index === 0 || index === last
        const meta = leaving ? legMeta(leaving) : ''
        return (
          <Fragment key={index}>
            <li className={styles.stopRow}>
              <span className={styles.times}>
                {arriving && <time dateTime={arriving.arriveAt}>{clock(arriving.arriveAt)}着</time>}
                {leaving && <time dateTime={leaving.departAt}>{clock(leaving.departAt)}発</time>}
              </span>
              <span className={styles.track} aria-hidden>
                <span className={terminal ? styles.dotTerminal : styles.dotTransfer} />
              </span>
              <span className={styles.stopBody}>
                <span className={terminal ? styles.station : styles.stationIntermediate}>{stop.station}</span>
                {!terminal && <StopBadges stop={stop} />}
              </span>
            </li>
            {leaving && (
              <li className={styles.legRow}>
                <span className={styles.times} />
                <span className={styles.track} aria-hidden>
                  <span className={`${styles.rail} ${railClass(leaving.lineCode)}`} />
                </span>
                <span className={styles.legBody}>
                  <LinePill lineCode={leaving.lineCode} lineName={leaving.lineName} />
                  {meta !== '' && <span className={styles.legMeta}>{meta}</span>}
                  {leaving.carPosition !== null && (
                    <span className={styles.car}>
                      <span className={styles.carLabel}>乗車位置</span>
                      <span className={styles.carValue}>{leaving.carPosition}</span>
                    </span>
                  )}
                </span>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}

export function RouteDetail({ route, candidate }: RouteDetailProps) {
  if (candidate && candidate.legs.length > 0) {
    return (
      <div className={styles.container}>
        <StructuredRoute candidate={candidate} />
      </div>
    )
  }

  // Legacy path (ADR 0006 D-3): the card came from `routes` alone, so only the strings exist.
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
      <ol className={styles.timeline}>
        {stations.map((item, index) => {
          const terminal = item.isTerminal
          return (
            <li key={index} className={terminal ? styles.stop : styles.stopIntermediate}>
              <div className={styles.marker}>
                <div className={terminal ? styles.dotTerminal : styles.dotTransfer} />
                {index < stations.length - 1 && <div className={styles.line} />}
              </div>
              <div className={terminal ? styles.content : styles.contentIntermediate}>
                <span className={terminal ? styles.station : styles.stationIntermediate}>
                  {item.station}
                </span>
                {item.line && (
                  <span className={styles.lineName}>{item.line}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
