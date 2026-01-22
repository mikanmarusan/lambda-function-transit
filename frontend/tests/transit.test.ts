import { describe, it, expect } from 'vitest'
import { parseTransitResponse, parseSummary, parseRoute } from '../src/types/transit'

describe('parseTransitResponse', () => {
  it('should parse transit response correctly', () => {
    const response = {
      transfers: [
        ['18:49発 → 19:38着(49分)(1回)', '■六本木一丁目\n｜東京メトロ南北線'],
        ['18:55発 → 19:45着(50分)(2回)', '■六本木一丁目\n｜東京メトロ丸ノ内線'],
      ] as [string, string][]
    }

    const result = parseTransitResponse(response)

    expect(result).toHaveLength(2)
    expect(result[0].summary).toBe('18:49発 → 19:38着(49分)(1回)')
    expect(result[0].route).toBe('■六本木一丁目\n｜東京メトロ南北線')
  })

  it('should handle empty transfers array', () => {
    const response = { transfers: [] }
    const result = parseTransitResponse(response)
    expect(result).toHaveLength(0)
  })
})

describe('parseSummary', () => {
  it('should parse summary with all fields', () => {
    const summary = '18:49発 → 19:38着(49分)(1回)'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('18:49')
    expect(result.arrivalTime).toBe('19:38')
    expect(result.duration).toBe('49分')
    expect(result.transfers).toBe('1回')
  })

  it('should handle malformed summary', () => {
    const summary = 'invalid format'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('--:--')
    expect(result.arrivalTime).toBe('--:--')
    expect(result.duration).toBe('--')
    expect(result.transfers).toBe('--')
  })

  it('should handle partial data', () => {
    const summary = '18:49発 → 19:38着'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('18:49')
    expect(result.arrivalTime).toBe('19:38')
    expect(result.duration).toBe('--')
    expect(result.transfers).toBe('--')
  })
})

describe('parseRoute', () => {
  it('should parse route with stations and lines', () => {
    const route = '■六本木一丁目\n｜東京メトロ南北線\n■溜池山王\n｜東京メトロ銀座線\n■渋谷'
    const result = parseRoute(route)

    expect(result).toHaveLength(3)
    expect(result[0].station).toBe('六本木一丁目')
    expect(result[0].line).toBe('東京メトロ南北線')
    expect(result[1].station).toBe('溜池山王')
    expect(result[1].line).toBe('東京メトロ銀座線')
    expect(result[2].station).toBe('渋谷')
    expect(result[2].line).toBeNull()
  })

  it('should handle empty route', () => {
    const route = ''
    const result = parseRoute(route)
    expect(result).toHaveLength(0)
  })

  it('should handle route without line names', () => {
    const route = '■駅A\n■駅B'
    const result = parseRoute(route)

    expect(result).toHaveLength(2)
    expect(result[0].station).toBe('駅A')
    expect(result[0].line).toBeNull()
  })
})
