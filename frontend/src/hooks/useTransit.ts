import { useState, useCallback, useEffect, useRef } from 'react'
import { MultiTransitState, isValidStructuredTransit } from '../types/transit'

const API_BASE = '/api'

export function useTransit() {
  const [state, setState] = useState<MultiTransitState>({
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

      // Fails closed: a payload outside the structured contract is an error, never partial data.
      if (!isValidStructuredTransit(data)) {
        throw new Error('Invalid API response format')
      }

      setState({
        origins: data.origins,
        generatedAt: data.generatedAt,
        fastestOrigin: data.fastestOrigin,
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
