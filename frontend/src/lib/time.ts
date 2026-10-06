// Clock-dependent values derived on the client (ADR 0006 D-2, ADR 0007 D-2). Every input is an
// absolute instant (epoch ms, or ISO 8601 with an explicit +09:00 offset), so no
// result depends on the runtime's local time zone and no midnight wrap is needed.

const MINUTE_MS = 60_000
const SECOND_MS = 1_000

/**
 * Whole minutes left before the rider must leave the office to catch a train:
 * `departureAt - walkMinutes - now`, floored. `0` means "leave now"; a negative
 * value means the train can no longer be caught. `null` when `departureAt` does
 * not parse or a number is not finite.
 */
export function minutesUntilLeave(departureAt: string, walkMinutes: number, nowMs: number): number | null {
  const departureMs = Date.parse(departureAt)
  if (!Number.isFinite(departureMs) || !Number.isFinite(walkMinutes) || !Number.isFinite(nowMs)) return null
  return Math.floor((departureMs - walkMinutes * MINUTE_MS - nowMs) / MINUTE_MS)
}

/**
 * Relative label for how long ago `sinceMs` was: `N秒前` under one minute,
 * `N分前` from one minute on. A `sinceMs` in the future (clock skew) or a non-finite input reads `0秒前`.
 */
export function relativeTimeLabel(sinceMs: number, nowMs: number): string {
  const diff = nowMs - sinceMs
  const elapsed = Number.isFinite(diff) ? Math.max(0, diff) : 0
  if (elapsed < MINUTE_MS) return `${Math.floor(elapsed / SECOND_MS)}秒前`
  return `${Math.floor(elapsed / MINUTE_MS)}分前`
}

/** Data at least this old (since the last successful fetch) is stale (ADR 0007 D-2). */
export const STALE_AFTER_MS = 180_000

/**
 * True when `nowMs - lastUpdatedMs` is `STALE_AFTER_MS` or more. A non-finite
 * input is never stale, so a clock fault cannot raise the stale pill on its own.
 */
export function isStale(lastUpdatedMs: number, nowMs: number): boolean {
  const diff = nowMs - lastUpdatedMs
  return Number.isFinite(diff) && diff >= STALE_AFTER_MS
}

const CLOCK_FORMAT = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Tokyo',
})

/** `HH:MM` wall-clock time in JST for an epoch-ms instant, independent of the runtime time zone. */
export function formatClockTime(ms: number): string {
  return CLOCK_FORMAT.format(ms)
}
