import { describe, it, expect } from 'vitest'
import { parseTransitResponse, parseSummary, parseRoute } from '../src/types/transit'

describe('parseTransitResponse', () => {
  it('should parse multi-origin transit response correctly', () => {
    const response = {
      routes: [
        {
          origin: '六本木一丁目',
          destination: 'つつじヶ丘（東京）',
          transfers: [
            ['18:49発 → 19:38着(49分)(1回)', '■六本木一丁目\n｜東京メトロ南北線'],
            ['18:55発 → 19:45着(50分)(2回)', '■六本木一丁目\n｜東京メトロ丸ノ内線'],
          ] as [string, string][],
        },
      ],
    }

    const result = parseTransitResponse(response)

    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('六本木一丁目')
    expect(result[0].destination).toBe('つつじヶ丘（東京）')
    expect(result[0].transfers).toHaveLength(2)
    expect(result[0].transfers[0].summary).toBe('18:49発 → 19:38着(49分)(1回)')
    expect(result[0].transfers[0].route).toBe('■六本木一丁目\n｜東京メトロ南北線')
  })

  it('should handle empty routes array', () => {
    const response = { routes: [] }
    const result = parseTransitResponse(response)
    expect(result).toHaveLength(0)
  })

  it('should parse multiple origin routes', () => {
    const response = {
      routes: [
        {
          origin: '六本木一丁目',
          destination: 'つつじヶ丘（東京）',
          transfers: [['summary1', 'route1']] as [string, string][],
        },
        {
          origin: '神谷町',
          destination: 'つつじヶ丘（東京）',
          transfers: [['summary2', 'route2']] as [string, string][],
        },
      ],
    }

    const result = parseTransitResponse(response)

    expect(result).toHaveLength(2)
    expect(result[0].origin).toBe('六本木一丁目')
    expect(result[1].origin).toBe('神谷町')
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

  it('should parse tilde format with hours and minutes duration', () => {
    const summary = '06:30～08:45(2時間15分)(2回)'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('06:30')
    expect(result.arrivalTime).toBe('08:45')
    expect(result.duration).toBe('2時間15分')
    expect(result.transfers).toBe('2回')
  })

  it('should parse tilde format with hours-only duration', () => {
    const summary = '06:30～08:30(2時間)(1回)'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('06:30')
    expect(result.arrivalTime).toBe('08:30')
    expect(result.duration).toBe('2時間')
    expect(result.transfers).toBe('1回')
  })

  it('should parse tilde format with minutes-only duration', () => {
    const summary = '18:00～18:45(45分)(0回)'
    const result = parseSummary(summary)

    expect(result.departureTime).toBe('18:00')
    expect(result.arrivalTime).toBe('18:45')
    expect(result.duration).toBe('45分')
    expect(result.transfers).toBe('0回')
  })
})

describe('parseRoute', () => {
  it('should parse route with stations and lines', () => {
    const route = '■六本木一丁目\n｜東京メトロ南北線\n■溜池山王\n｜東京メトロ銀座線\n■渋谷'
    const result = parseRoute(route)

    expect(result).toHaveLength(3)
    expect(result[0].station).toBe('六本木一丁目')
    expect(result[0].line).toBe('東京メトロ南北線')
    expect(result[0].isTerminal).toBe(true)
    expect(result[1].station).toBe('溜池山王')
    expect(result[1].line).toBe('東京メトロ銀座線')
    expect(result[1].isTerminal).toBe(true)
    expect(result[2].station).toBe('渋谷')
    expect(result[2].line).toBeNull()
    expect(result[2].isTerminal).toBe(true)
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
    expect(result[0].isTerminal).toBe(true)
    expect(result[1].isTerminal).toBe(true)
  })

  it('should parse route with intermediate transfer stations (◇)', () => {
    const route = '■六本木一丁目 1番線発\n｜東京メトロ南北線(浦和美園行) 3.1km\n◇永田町 3番線着・1番線発 ［乗換4分+待ち4分］\n｜東京メトロ半蔵門線(中央林間行) 5.7km\n◇渋谷 1番線着・1番線発 ［乗換6分+待ち4分］\n｜京王井の頭線(吉祥寺行) 12.5km\n■つつじヶ丘（東京） 1・2番線着'
    const result = parseRoute(route)

    expect(result).toHaveLength(4)
    expect(result[0].station).toBe('六本木一丁目 1番線発')
    expect(result[0].line).toBe('東京メトロ南北線(浦和美園行) 3.1km')
    expect(result[0].isTerminal).toBe(true)
    expect(result[1].station).toBe('永田町 3番線着・1番線発 ［乗換4分+待ち4分］')
    expect(result[1].line).toBe('東京メトロ半蔵門線(中央林間行) 5.7km')
    expect(result[1].isTerminal).toBe(false)
    expect(result[2].station).toBe('渋谷 1番線着・1番線発 ［乗換6分+待ち4分］')
    expect(result[2].line).toBe('京王井の頭線(吉祥寺行) 12.5km')
    expect(result[2].isTerminal).toBe(false)
    expect(result[3].station).toBe('つつじヶ丘（東京） 1・2番線着')
    expect(result[3].line).toBeNull()
    expect(result[3].isTerminal).toBe(true)
  })

  it('should mark all ◇ stations as non-terminal', () => {
    const route = '◇駅A\n｜路線X\n◇駅B'
    const result = parseRoute(route)

    expect(result).toHaveLength(2)
    expect(result[0].station).toBe('駅A')
    expect(result[0].isTerminal).toBe(false)
    expect(result[1].station).toBe('駅B')
    expect(result[1].isTerminal).toBe(false)
  })
})
