import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { isValidStructuredTransit, STRUCTURED_LIMITS, LINE_CODES } from '../src/types/transit'
import { useTransit } from '../src/hooks/useTransit'

const stop = (station: string) => ({
  station,
  arrivalPlatform: null,
  departurePlatform: '1番線',
  transferMinutes: null,
  waitMinutes: null,
  noAlight: false,
})

const leg = (lineCode: string | null = 'N') => ({
  lineName: '東京メトロ南北線',
  lineCode,
  trainType: null,
  via: null,
  destination: '浦和美園',
  departAt: '2026-10-06T20:45:00+09:00',
  arriveAt: '2026-10-06T20:51:00+09:00',
  minutes: 6,
  distanceKm: 3.1,
  carPosition: '3・6号車',
})

const candidate = () => ({
  departureAt: '2026-10-06T20:45:00+09:00',
  arrivalAt: '2026-10-06T20:51:00+09:00',
  durationMinutes: 6,
  transferCount: 0,
  isFastest: true,
  isFewestTransfers: true,
  stops: [stop('六本木一丁目'), stop('四ッ谷')],
  legs: [leg()],
})

const origin = (name = '六本木一丁目') => ({
  origin: name,
  walkMinutes: 4,
  searchedFrom: '2026-10-06T20:44:00+09:00',
  status: 'ok',
  candidates: [candidate()],
})

// Returns a fresh, valid payload; tests mutate their own copy.
const payload = () => ({
  routes: [],
  generatedAt: '2026-10-06T20:40:12+09:00',
  destination: 'つつじヶ丘（東京）',
  fastestOrigin: '六本木一丁目' as string | null,
  origins: [origin(), { ...origin('神谷町'), status: 'error', candidates: [] }],
})

describe('isValidStructuredTransit', () => {
  it('accepts a well-formed payload', () => {
    expect(isValidStructuredTransit(payload())).toBe(true)
  })

  it('accepts fastestOrigin null and every allow-listed lineCode plus null', () => {
    const p = payload()
    p.fastestOrigin = null
    p.origins[0].candidates[0].legs = [...LINE_CODES, null].map((c) => leg(c))
    p.origins[0].candidates[0].stops = Array.from({ length: LINE_CODES.length + 2 }, (_, i) => stop(`S${i}`))
    expect(isValidStructuredTransit(p)).toBe(true)
  })

  it.each([
    ['null', () => null],
    ['an array', () => []],
    ['missing origins', () => ({ ...payload(), origins: undefined })],
    ['origins not an array', () => ({ ...payload(), origins: {} })],
    ['generatedAt not ISO JST', () => ({ ...payload(), generatedAt: '2026-10-06T11:40:12Z' })],
    ['generatedAt invalid date', () => ({ ...payload(), generatedAt: '2026-13-45T99:99:99+09:00' })],
    ['destination not a string', () => ({ ...payload(), destination: 42 })],
    ['fastestOrigin not among origins', () => ({ ...payload(), fastestOrigin: '渋谷' })],
    ['fastestOrigin wrong type', () => ({ ...payload(), fastestOrigin: 1 })],
  ])('rejects a malformed top level: %s', (_name, make) => {
    expect(isValidStructuredTransit(make())).toBe(false)
  })

  it.each<[string, (p: ReturnType<typeof payload>) => void]>([
    ['unknown status', (p) => { p.origins[0].status = 'pending' }],
    ['walkMinutes negative', (p) => { p.origins[0].walkMinutes = -1 }],
    ['walkMinutes fractional', (p) => { p.origins[0].walkMinutes = 1.5 }],
    ['searchedFrom missing', (p) => { (p.origins[0] as Record<string, unknown>).searchedFrom = undefined }],
    ['candidate isFastest not boolean', (p) => { (p.origins[0].candidates[0] as Record<string, unknown>).isFastest = 'yes' }],
    ['candidate arrivalAt malformed', (p) => { p.origins[0].candidates[0].arrivalAt = '20:51' }],
    ['stops/legs count mismatch', (p) => { p.origins[0].candidates[0].stops.pop() }],
    ['stop noAlight missing', (p) => { (p.origins[0].candidates[0].stops[0] as Record<string, unknown>).noAlight = undefined }],
    ['leg lineCode outside allow-list', (p) => { p.origins[0].candidates[0].legs[0].lineCode = 'X' }],
    ['leg lineCode CSS injection', (p) => { p.origins[0].candidates[0].legs[0].lineCode = 'N; color: red' }],
    ['leg lineCode lowercase', (p) => { p.origins[0].candidates[0].legs[0].lineCode = 'n' }],
    ['leg distanceKm NaN', (p) => { p.origins[0].candidates[0].legs[0].distanceKm = NaN }],
    ['leg departAt not a string', (p) => { (p.origins[0].candidates[0].legs[0] as Record<string, unknown>).departAt = 0 }],
  ])('rejects a malformed nested field: %s', (_name, mutate) => {
    const p = payload()
    mutate(p)
    expect(isValidStructuredTransit(p)).toBe(false)
  })

  const longString = 'あ'.repeat(STRUCTURED_LIMITS.stringLength + 1)
  const atLimitString = 'あ'.repeat(STRUCTURED_LIMITS.stringLength)

  // Each row fills `n` items: n origins, n candidates, or n stops (with n - 1 legs,
  // since stops.length === legs.length + 1, so the stops cap bounds legs as well).
  it.each<[string, number, (p: ReturnType<typeof payload>, n: number) => void]>([
    ['origins', STRUCTURED_LIMITS.origins, (p, n) => {
      p.origins = Array.from({ length: n }, (_, i) => origin(`駅${i}`))
      p.fastestOrigin = null
    }],
    ['candidates', STRUCTURED_LIMITS.candidates, (p, n) => {
      p.origins[0].candidates = Array.from({ length: n }, candidate)
    }],
    ['stops/legs', STRUCTURED_LIMITS.stops, (p, n) => {
      p.origins[0].candidates[0].stops = Array.from({ length: n }, (_, i) => stop(`S${i}`))
      p.origins[0].candidates[0].legs = Array.from({ length: n - 1 }, () => leg())
    }],
  ])('enforces the %s limit of %i', (_name, limit, fill) => {
    const atLimit = payload()
    fill(atLimit, limit)
    expect(isValidStructuredTransit(atLimit)).toBe(true)
    const over = payload()
    fill(over, limit + 1)
    expect(isValidStructuredTransit(over)).toBe(false)
  })

  it.each<[string, (p: ReturnType<typeof payload>, s: string) => void]>([
    ['destination', (p, s) => { p.destination = s }],
    ['origin name', (p, s) => { p.origins[1].origin = s }],
    ['station', (p, s) => { p.origins[0].candidates[0].stops[0].station = s }],
    ['platform', (p, s) => { p.origins[0].candidates[0].stops[0].departurePlatform = s }],
    ['lineName', (p, s) => { p.origins[0].candidates[0].legs[0].lineName = s }],
    ['carPosition', (p, s) => { p.origins[0].candidates[0].legs[0].carPosition = s }],
  ])('caps the %s string at the length limit', (_name, set) => {
    const ok = payload()
    set(ok, atLimitString)
    expect(isValidStructuredTransit(ok)).toBe(true)
    const over = payload()
    set(over, longString)
    expect(isValidStructuredTransit(over)).toBe(false)
  })
})

describe('useTransit structured fields', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubFetch = (body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

  it('returns origins, generatedAt and fastestOrigin alongside the legacy routes', async () => {
    const body = {
      ...payload(),
      routes: [{ origin: '六本木一丁目', destination: 'つつじヶ丘（東京）', transfers: [['s', 'r']] }],
    }
    stubFetch(body)
    const { result } = renderHook(() => useTransit())
    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull())
    expect(result.current.origins).toEqual(body.origins)
    expect(result.current.generatedAt).toBe(body.generatedAt)
    expect(result.current.fastestOrigin).toBe('六本木一丁目')
    expect(result.current.originRoutes).toEqual([
      { origin: '六本木一丁目', destination: 'つつじヶ丘（東京）', transfers: [{ summary: 's', route: 'r' }] },
    ])
    expect(result.current.error).toBeNull()
  })

  it('drops an invalid structured part but keeps the legacy routes', async () => {
    const p = payload()
    p.origins[0].candidates[0].legs[0].lineCode = 'X'
    stubFetch({ ...p, routes: [{ origin: 'A', destination: 'B', transfers: [] }] })
    const { result } = renderHook(() => useTransit())
    await waitFor(() => expect(result.current.lastUpdated).not.toBeNull())
    expect(result.current.origins).toEqual([])
    expect(result.current.generatedAt).toBeNull()
    expect(result.current.fastestOrigin).toBeNull()
    expect(result.current.originRoutes).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })
})
