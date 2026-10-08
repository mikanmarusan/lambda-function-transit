import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { Candidate, Leg, LineCode, Stop } from '../src/types/transit'
import { LINE_CODES } from '../src/types/transit'
import { RouteDetail } from '../src/components/RouteDetail'
import styles from '../src/components/RouteDetail.module.css'

/**
 * The structured route detail (issue #124): an ordered list of stops and legs with per-leg times,
 * a colour rail per line, train type / destination / distance, a boarding-position callout, and
 * the 乗換 / 待ち / 余裕なし / 降車不要 badges on transfer stops.
 */

const at = (hhmm: string) => `2026-07-13T${hhmm}:00+09:00`

function stop(station: string, overrides: Partial<Stop> = {}): Stop {
  return {
    station,
    arrivalPlatform: null,
    departurePlatform: null,
    transferMinutes: null,
    waitMinutes: null,
    noAlight: false,
    ...overrides,
  }
}

function leg(lineCode: LineCode | null, departAt: string, arriveAt: string, overrides: Partial<Leg> = {}): Leg {
  return {
    lineName: '路線',
    lineCode,
    trainType: null,
    via: null,
    destination: null,
    departAt: at(departAt),
    arriveAt: at(arriveAt),
    minutes: 5,
    distanceKm: null,
    carPosition: null,
    ...overrides,
  }
}

/** 六本木一丁目 -N-> 溜池山王 -M-> 新宿 -KO-> つつじヶ丘, with the given transfer-stop fields. */
function makeCandidate(first: Partial<Stop> = {}, second: Partial<Stop> = {}, legs?: Leg[]): Candidate {
  return {
    departureAt: at('18:49'),
    arrivalAt: at('19:38'),
    durationMinutes: 49,
    transferCount: 2,
    isFastest: false,
    isFewestTransfers: false,
    stops: [stop('六本木一丁目'), stop('溜池山王', first), stop('新宿', second), stop('つつじヶ丘')],
    legs: legs ?? [
      leg('N', '18:49', '18:52', {
        lineName: '東京メトロ南北線',
        trainType: '各停',
        destination: '浦和美園',
        distanceKm: 3.1,
        carPosition: '3・6号車',
      }),
      leg('M', '18:56', '19:10', { lineName: '東京メトロ丸ノ内線', carPosition: '前／1号車' }),
      leg('KO', '19:12', '19:38', { lineName: '京王線', trainType: '急行', carPosition: '後方' }),
    ],
  }
}

const renderDetail = (candidate: Candidate) => render(<RouteDetail candidate={candidate} />)

describe('RouteDetail structured route', () => {
  it('marks the route up as an ordered list of stop and leg rows', () => {
    const { container } = renderDetail(makeCandidate())
    const list = container.querySelector('ol')
    expect(list).not.toBeNull()
    // 4 stops + 3 legs, in route order.
    const rows = within(list!).getAllByRole('listitem')
    expect(rows).toHaveLength(7)
    expect(rows[0].textContent).toContain('六本木一丁目')
    expect(rows[1].textContent).toContain('東京メトロ南北線')
    expect(rows[6].textContent).toContain('つつじヶ丘')
  })

  it('shows the departure, each transfer arrival and departure, and the final arrival', () => {
    const { container } = renderDetail(makeCandidate())
    const times = [...container.querySelectorAll('time')].map((t) => [t.textContent, t.getAttribute('dateTime')])
    expect(times).toEqual([
      ['18:49発', at('18:49')],
      ['18:52着', at('18:52')],
      ['18:56発', at('18:56')],
      ['19:10着', at('19:10')],
      ['19:12発', at('19:12')],
      ['19:38着', at('19:38')],
    ])
  })

  it('shows the train type, destination and distance of a leg, skipping missing parts', () => {
    renderDetail(makeCandidate())
    expect(screen.getByText('各停 · 浦和美園行 · 3.1km').className).toContain(styles.legMeta)
    expect(screen.getByText('急行').className).toContain(styles.legMeta)
  })

  it('drops an empty part instead of leaving a dangling separator', () => {
    const legs = makeCandidate().legs.map((l) => ({ ...l, trainType: '', destination: '荻窪', distanceKm: null }))
    renderDetail(makeCandidate({}, {}, legs))
    expect(screen.getAllByText('荻窪行')).toHaveLength(3)
  })

  it.each(['3・6号車', '前／1号車', '後方'])('renders the boarding position %s in the callout', (position) => {
    renderDetail(makeCandidate())
    const value = screen.getByText(position)
    expect(value.className).toContain(styles.carValue)
    expect(value.parentElement!.className).toContain(styles.car)
    expect(within(value.parentElement!).getByText('乗車位置')).toBeTruthy()
  })

  it('omits the callout when a leg has no boarding position', () => {
    const legs = makeCandidate().legs.map((l) => ({ ...l, carPosition: null }))
    renderDetail(makeCandidate({}, {}, legs))
    expect(screen.queryByText('乗車位置')).toBeNull()
  })

  it('paints each leg rail through its allow-listed line class', () => {
    const { container } = renderDetail(makeCandidate())
    const rails = [...container.querySelectorAll(`.${styles.rail}`)]
    expect(rails.map((r) => r.className)).toEqual([
      `${styles.rail} ${styles.railN}`,
      `${styles.rail} ${styles.railM}`,
      `${styles.rail} ${styles.railKo}`,
    ])
    // The leg's line identity reuses LinePill: the letter code beside the name.
    expect(screen.getByText('N')).toBeTruthy()
  })

  it.each(LINE_CODES)('gives lineCode %s its own rail class', (code) => {
    const { container } = renderDetail({
      ...makeCandidate(),
      stops: [stop('A'), stop('B')],
      legs: [leg(code, '18:49', '18:52')],
    })
    const rail = container.querySelector(`.${styles.rail}`)!
    const expected = { N: 'railN', M: 'railM', H: 'railH', Z: 'railZ', E: 'railE', S: 'railS', KO: 'railKo' }[code]
    expect(rail.classList.contains(styles[expected])).toBe(true)
  })

  it('falls back to the neutral rail for a null or non-allow-listed code, and writes no style attribute', () => {
    const { container } = renderDetail({
      ...makeCandidate(),
      stops: [stop('A'), stop('B'), stop('C')],
      legs: [leg(null, '18:49', '18:52'), leg('constructor' as LineCode, '18:53', '18:58')],
    })
    const rails = [...container.querySelectorAll(`.${styles.rail}`)]
    expect(rails.map((r) => r.className)).toEqual([
      `${styles.rail} ${styles.railNeutral}`,
      `${styles.rail} ${styles.railNeutral}`,
    ])
    expect(container.querySelector('[style]')).toBeNull()
  })

  it('shows 乗換 N分 and 待ち N分 on a transfer stop, without 余裕なし when the wait is above 0', () => {
    renderDetail(makeCandidate({ transferMinutes: 4, waitMinutes: 2 }))
    expect(screen.getByText('乗換 4分').className).toContain(styles.badge)
    expect(screen.getByText('待ち 2分').className).toContain(styles.badge)
    expect(screen.queryByText('余裕なし')).toBeNull()
  })

  it('warns 余裕なし in amber when the wait is 0', () => {
    renderDetail(makeCandidate({ transferMinutes: 3, waitMinutes: 0 }))
    expect(screen.getByText('待ち 0分')).toBeTruthy()
    const warning = screen.getByText('余裕なし')
    expect(warning.className).toContain(styles.badgeTight)
    // Only the tight stop warns.
    expect(screen.getAllByText('余裕なし')).toHaveLength(1)
  })

  it('shows a 降車不要 chip instead of 乗換 on a through-running stop, and no 余裕なし there', () => {
    renderDetail(makeCandidate({}, { noAlight: true, transferMinutes: 0, waitMinutes: 0 }))
    const chip = screen.getByText('降車不要')
    expect(chip.className).toContain(styles.badgeThrough)
    expect(within(chip.parentElement!).queryByText(/^乗換/)).toBeNull()
    expect(within(chip.parentElement!).getByText('待ち 0分')).toBeTruthy()
    expect(screen.queryByText('余裕なし')).toBeNull()
  })

  it('shows no badges on a transfer stop that carries no transfer fields', () => {
    const { container } = renderDetail(makeCandidate())
    expect(container.querySelector(`.${styles.badge}`)).toBeNull()
  })
})

describe('RouteDetail without legs', () => {
  it('draws a leg-less candidate as its lone terminal stop, with no times and no rail', () => {
    const candidate = { ...makeCandidate(), stops: [stop('六本木一丁目')], legs: [] }
    const { container } = renderDetail(candidate)
    expect(container.querySelector('ol')?.className).toBe(styles.route)
    expect(container.querySelectorAll('ol > li')).toHaveLength(1)
    expect(screen.getByText('六本木一丁目').className).toBe(styles.station)
    expect(container.querySelector('time')).toBeNull()
    expect(container.querySelector(`.${styles.rail}`)).toBeNull()
    expect(container.querySelector('pre')).toBeNull()
  })
})
