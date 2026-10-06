import { describe, it, expect, afterAll } from 'vitest'
import { minutesUntilLeave, relativeTimeLabel } from '../src/lib/time'

const DEPARTURE = '2026-10-06T20:45:00+09:00'
const WALK = 4
// The instant the rider must leave: 20:41:00 JST.
const LEAVE_AT = Date.parse('2026-10-06T20:41:00+09:00')
const MIN = 60_000
const SEC = 1_000

function sampleResults() {
  return {
    leave: [
      minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT - MIN),
      minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT),
      minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT + MIN),
      minutesUntilLeave('2026-12-31T23:59:00+09:00', 11, Date.parse('2026-12-31T23:40:00+09:00')),
    ],
    labels: [0, 59, 60].map((s) => relativeTimeLabel(LEAVE_AT, LEAVE_AT + s * SEC)),
  }
}

describe('minutesUntilLeave', () => {
  it('is 1 one minute before the leave-by instant', () => {
    expect(minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT - MIN)).toBe(1)
  })

  it('is 0 at the leave-by instant', () => {
    expect(minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT)).toBe(0)
  })

  it('is -1 one minute after the leave-by instant', () => {
    expect(minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT + MIN)).toBe(-1)
  })

  it('floors partial minutes', () => {
    expect(minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT - 59 * SEC)).toBe(0)
    expect(minutesUntilLeave(DEPARTURE, WALK, LEAVE_AT + SEC)).toBe(-1)
  })

  it('subtracts the walk time across midnight from the ISO instant', () => {
    expect(minutesUntilLeave('2027-01-01T00:05:00+09:00', 11, Date.parse('2026-12-31T23:50:00+09:00'))).toBe(4)
  })

  it('returns null for an unparseable departure', () => {
    expect(minutesUntilLeave('not a date', WALK, LEAVE_AT)).toBeNull()
  })

  it('returns null for a non-finite walk time or now', () => {
    expect(minutesUntilLeave(DEPARTURE, NaN, LEAVE_AT)).toBeNull()
    expect(minutesUntilLeave(DEPARTURE, WALK, Infinity)).toBeNull()
  })
})

describe('relativeTimeLabel', () => {
  it('reads 0秒前 at 0 seconds', () => {
    expect(relativeTimeLabel(LEAVE_AT, LEAVE_AT)).toBe('0秒前')
  })

  it('reads 59秒前 at 59 seconds', () => {
    expect(relativeTimeLabel(LEAVE_AT, LEAVE_AT + 59 * SEC)).toBe('59秒前')
  })

  it('reads 1分前 at 60 seconds', () => {
    expect(relativeTimeLabel(LEAVE_AT, LEAVE_AT + 60 * SEC)).toBe('1分前')
  })

  it('floors minutes and clamps a future instant to 0秒前', () => {
    expect(relativeTimeLabel(LEAVE_AT, LEAVE_AT + 179 * SEC)).toBe('2分前')
    expect(relativeTimeLabel(LEAVE_AT + 5 * SEC, LEAVE_AT)).toBe('0秒前')
  })

  it('reads 0秒前 for a non-finite instant', () => {
    expect(relativeTimeLabel(NaN, LEAVE_AT)).toBe('0秒前')
  })
})

describe('time zone independence', () => {
  const originalTz = process.env.TZ
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('gives identical results under TZ=UTC and TZ=Asia/Tokyo', () => {
    process.env.TZ = 'Asia/Tokyo'
    const tokyo = sampleResults()
    process.env.TZ = 'UTC'
    // Proves the TZ switch actually took effect, so the comparison is not vacuous.
    expect(new Date(0).getHours()).toBe(0)
    const utc = sampleResults()
    expect(utc).toEqual(tokyo)
    expect(utc).toEqual({ leave: [1, 0, -1, 8], labels: ['0秒前', '59秒前', '1分前'] })
  })
})
