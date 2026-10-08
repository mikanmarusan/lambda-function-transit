export interface StatusResponse {
  status: string
  timestamp: string
}

export interface MultiTransitState {
  origins: OriginResult[]
  generatedAt: string | null
  fastestOrigin: string | null
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

/** Closed `lineCode` set (ADR 0008 D-1); any other line arrives as `null`. */
export const LINE_CODES = ['N', 'M', 'H', 'Z', 'E', 'S', 'KO'] as const
export type LineCode = (typeof LINE_CODES)[number]

export interface Stop {
  station: string
  arrivalPlatform: string | null
  departurePlatform: string | null
  transferMinutes: number | null
  waitMinutes: number | null
  noAlight: boolean
}

export interface Leg {
  lineName: string
  lineCode: LineCode | null
  trainType: string | null
  via: string | null
  destination: string | null
  departAt: string
  arriveAt: string
  minutes: number
  distanceKm: number | null
  carPosition: string | null
}

export interface Candidate {
  departureAt: string
  arrivalAt: string
  durationMinutes: number
  transferCount: number
  isFastest: boolean
  isFewestTransfers: boolean
  stops: Stop[]
  legs: Leg[]
}

export type OriginStatus = 'ok' | 'no_candidates' | 'error'

export interface OriginResult {
  origin: string
  walkMinutes: number
  searchedFrom: string
  status: OriginStatus
  candidates: Candidate[]
}

/** The body of `GET /api/transit`: the structured transit contract (ADR 0006 D-2). */
export interface StructuredTransit {
  generatedAt: string
  destination: string
  fastestOrigin: string | null
  origins: OriginResult[]
}

/** Upper bounds a structured payload must stay within to be accepted. */
export const STRUCTURED_LIMITS = {
  origins: 10,
  candidates: 10,
  // Also bounds legs: a candidate must satisfy stops.length === legs.length + 1.
  stops: 20,
  stringLength: 100,
  minutes: 24 * 60,
} as const

const ORIGIN_STATUSES: readonly string[] = ['ok', 'no_candidates', 'error']
const ISO_JST = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/

type Rec = Record<string, unknown>

const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length <= STRUCTURED_LIMITS.stringLength
const isStrOrNull = (v: unknown) => v === null || isStr(v)
const isMinutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= STRUCTURED_LIMITS.minutes
const isMinutesOrNull = (v: unknown) => v === null || isMinutes(v)
const isIsoJst = (v: unknown) => typeof v === 'string' && ISO_JST.test(v) && !Number.isNaN(Date.parse(v))
const isBoundedArray = (v: unknown, max: number): v is unknown[] => Array.isArray(v) && v.length <= max

function isStop(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.station) &&
    isStrOrNull(v.arrivalPlatform) &&
    isStrOrNull(v.departurePlatform) &&
    isMinutesOrNull(v.transferMinutes) &&
    isMinutesOrNull(v.waitMinutes) &&
    typeof v.noAlight === 'boolean'
  )
}

function isLeg(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.lineName) &&
    (v.lineCode === null || (LINE_CODES as readonly unknown[]).includes(v.lineCode)) &&
    isStrOrNull(v.trainType) &&
    isStrOrNull(v.via) &&
    isStrOrNull(v.destination) &&
    isIsoJst(v.departAt) &&
    isIsoJst(v.arriveAt) &&
    isMinutes(v.minutes) &&
    (v.distanceKm === null || (typeof v.distanceKm === 'number' && Number.isFinite(v.distanceKm) && v.distanceKm >= 0)) &&
    isStrOrNull(v.carPosition)
  )
}

function isCandidate(v: unknown): boolean {
  return (
    isRecord(v) &&
    isIsoJst(v.departureAt) &&
    isIsoJst(v.arrivalAt) &&
    isMinutes(v.durationMinutes) &&
    isMinutes(v.transferCount) &&
    typeof v.isFastest === 'boolean' &&
    typeof v.isFewestTransfers === 'boolean' &&
    isBoundedArray(v.stops, STRUCTURED_LIMITS.stops) &&
    Array.isArray(v.legs) &&
    v.stops.length === v.legs.length + 1 &&
    v.stops.every(isStop) &&
    v.legs.every(isLeg)
  )
}

function isOriginResult(v: unknown): boolean {
  return (
    isRecord(v) &&
    isStr(v.origin) &&
    isMinutes(v.walkMinutes) &&
    isIsoJst(v.searchedFrom) &&
    ORIGIN_STATUSES.includes(v.status as string) &&
    isBoundedArray(v.candidates, STRUCTURED_LIMITS.candidates) &&
    v.candidates.every(isCandidate)
  )
}

/**
 * Validates a transit response. Rejects (fails closed on)
 * a malformed payload or one that exceeds `STRUCTURED_LIMITS`, so nothing unchecked
 * reaches the UI; `lineCode` must be one of `LINE_CODES` or `null`, because it
 * later selects an allow-listed CSS class (ADR 0008 D-1).
 */
export function isValidStructuredTransit(data: unknown): data is StructuredTransit {
  if (!isRecord(data)) return false
  if (!isIsoJst(data.generatedAt) || !isStr(data.destination)) return false
  if (!isBoundedArray(data.origins, STRUCTURED_LIMITS.origins) || !data.origins.every(isOriginResult)) return false
  const names = (data.origins as OriginResult[]).map((o) => o.origin)
  return data.fastestOrigin === null || (typeof data.fastestOrigin === 'string' && names.includes(data.fastestOrigin))
}
