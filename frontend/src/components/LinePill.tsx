import type { LineCode } from '../types/transit'
import styles from './LinePill.module.css'

interface LinePillProps {
  lineCode: LineCode | null
  lineName: string
}

/**
 * The ring colour of each closed-set `lineCode` (ADR 0008 D-1). The code only ever selects one of
 * these allow-listed classes; no response string is written into `style` or a custom property.
 */
const RING_CLASS: Record<LineCode, string> = {
  N: styles.lineN,
  M: styles.lineM,
  H: styles.lineH,
  Z: styles.lineZ,
  E: styles.lineE,
  S: styles.lineS,
  KO: styles.lineKo,
}

/**
 * One leg's line identity: a white circle with a `lineCode`-coloured ring and the letter code,
 * then the line name (ADR 0008 D-2: code and name carry the identity, the ring colour is
 * supplementary). A `null` or unknown code shows the line name alone, in the neutral style.
 */
export function LinePill({ lineCode, lineName }: LinePillProps) {
  const ring = lineCode !== null && Object.hasOwn(RING_CLASS, lineCode) ? RING_CLASS[lineCode] : null

  if (ring === null) {
    return (
      <span className={styles.pill}>
        <span className={`${styles.name} ${styles.nameNeutral}`}>{lineName}</span>
      </span>
    )
  }

  return (
    <span className={styles.pill}>
      <span className={`${styles.code} ${ring}`}>{lineCode}</span>
      <span className={styles.name}>{lineName}</span>
    </span>
  )
}
