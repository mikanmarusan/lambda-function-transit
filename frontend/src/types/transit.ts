export interface TransitRoute {
  summary: string
  route: string
}

export interface TransitResponse {
  transfers: [string, string][]
}

export interface StatusResponse {
  status: string
  timestamp: string
}

export interface TransitState {
  routes: TransitRoute[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function parseTransitResponse(data: TransitResponse): TransitRoute[] {
  return data.transfers.map(([summary, route]) => ({
    summary,
    route,
  }))
}

export function parseSummary(summary: string): {
  departureTime: string
  arrivalTime: string
  duration: string
  transfers: string
} {
  const timeMatch = summary.match(/(\d{1,2}:\d{2})発\s*→\s*(\d{1,2}:\d{2})着/)
  const durationMatch = summary.match(/\((\d+分)\)/)
  const transfersMatch = summary.match(/\((\d+回)\)/)

  return {
    departureTime: timeMatch?.[1] ?? '--:--',
    arrivalTime: timeMatch?.[2] ?? '--:--',
    duration: durationMatch?.[1] ?? '--',
    transfers: transfersMatch?.[1] ?? '--',
  }
}

export function parseRoute(route: string): { station: string; line: string | null }[] {
  const lines = route.split('\n').filter(line => line.trim())
  const result: { station: string; line: string | null }[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('■')) {
      const station = line.replace(/^■/, '').trim()
      const nextLine = lines[i + 1]
      const lineName = nextLine?.startsWith('｜') ? nextLine.replace(/^｜/, '').trim() : null
      result.push({ station, line: lineName })
    }
  }

  return result
}
