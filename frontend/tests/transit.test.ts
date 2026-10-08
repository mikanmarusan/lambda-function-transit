import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import * as transit from '../src/types/transit'
import { useTransit } from '../src/hooks/useTransit'

// The legacy `routes` field and its `[summary, route]` string parsers are gone (ADR 0006 D-3):
// the client reads the structured `origins` contract only.
const legacyOnly = {
  routes: [
    {
      origin: '六本木一丁目',
      destination: 'つつじヶ丘（東京）',
      transfers: [['18:49発 → 19:38着(49分)(1回)', '■六本木一丁目\n｜東京メトロ南北線']],
    },
  ],
}

describe('legacy routes removal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['parseSummary', 'parseRoute', 'parseTransitResponse', 'candidateToRoute'])(
    'no longer exports the legacy string helper %s',
    (name) => {
      expect(name in transit).toBe(false)
    }
  )

  it('rejects a legacy-only payload that carries routes but no origins', () => {
    expect(transit.isValidStructuredTransit(legacyOnly)).toBe(false)
  })

  it('surfaces a legacy-only response as an error instead of rendering from routes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(legacyOnly), { status: 200 })))
    const { result } = renderHook(() => useTransit())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error).toBe('Invalid API response format')
    expect(result.current.origins).toEqual([])
    expect('originRoutes' in result.current).toBe(false)
  })
})
