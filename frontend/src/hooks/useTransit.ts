import { useState, useCallback, useEffect, useRef } from 'react'
import {
  MultiTransitState,
  TransitResponse,
  isValidStructuredTransit,
  parseTransitResponse,
} from '../types/transit'

const API_BASE = '/api'

export function isValidTransitResponse(data: unknown): data is TransitResponse {
  if (typeof data !== 'object' || data === null || !('routes' in data)) return false
  const routes = (data as TransitResponse).routes
  if (!Array.isArray(routes)) return false
  return routes.every((r) => {
    if (r === null || typeof r !== 'object') return false
    const route = r as { origin: unknown; destination: unknown; transfers: unknown }
    if (typeof route.origin !== 'string' || typeof route.destination !== 'string') return false
    if (!Array.isArray(route.transfers)) return false
    return route.transfers.every(
      (t) =>
        Array.isArray(t) &&
        t.length === 2 &&
        typeof t[0] === 'string' &&
        typeof t[1] === 'string'
    )
  })
}

export function useTransit() {
  const [state, setState] = useState<MultiTransitState>({
    originRoutes: [],
    origins: [],
    generatedAt: null,
    fastestOrigin: null,
    loading: false,
    error: null,
    lastUpdated: null,
  })
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchTransit = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(`${API_BASE}/transit`, {
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const data: unknown = await response.json()

      if (!isValidTransitResponse(data)) {
        throw new Error('Invalid API response format')
      }

      const originRoutes = parseTransitResponse(data)
      // During the additive migration (ADR 0006 D-3) the UI falls back to the
      // legacy routes when `origins` is empty, so a structured part that fails
      // validation is dropped (empty origins, null fields) rather than failing
      // the whole response.
      const structured = isValidStructuredTransit(data) ? data : null

      setState({
        originRoutes,
        origins: structured?.origins ?? [],
        generatedAt: structured?.generatedAt ?? null,
        fastestOrigin: structured?.fastestOrigin ?? null,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  useEffect(() => {
    fetchTransit()
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [fetchTransit])

  return {
    ...state,
    refresh: fetchTransit,
  }
}

export function useApiStatus() {
  const [status, setStatus] = useState<'ok' | 'error' | 'loading'>('loading')

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/status`)
      setStatus(response.ok ? 'ok' : 'error')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    // setStatus only fires after the awaited fetch settles, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkStatus()
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [checkStatus])

  return status
}
