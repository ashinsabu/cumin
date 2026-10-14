import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'

const QUERY_KEYS = ['items', 'sprints', 'epics', 'projects', 'board'] as const

/**
 * Opens a persistent SSE connection to /api/events and immediately invalidates
 * active queries on each ping. Safe to do on your own mutations too — mutations
 * update the cache via setQueryData first, so the SSE refetch returns identical
 * data and TanStack's structural sharing suppresses any re-render.
 */
export function useRealtime(enabled: boolean, onPing?: () => void) {
  const queryClient = useQueryClient()
  const errorCount = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const API = import.meta.env.VITE_API_URL ?? ''
    const es = new EventSource(`${API}/api/events`, { withCredentials: true })

    es.onopen = () => {
      errorCount.current = 0
      console.debug('[realtime] SSE connected')
    }

    es.onmessage = () => {
      for (const key of QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey: [key], refetchType: 'active' })
      }
      onPing?.()
    }

    es.onerror = (e) => {
      errorCount.current += 1
      console.warn('[realtime] SSE error — will reconnect', e)
      // Report to Sentry after 3 consecutive failures to avoid noise from transient reconnects
      if (errorCount.current === 3) {
        Sentry.captureException(new Error('SSE /api/events persistent failure'), {
          extra: { consecutiveErrors: errorCount.current },
        })
      }
    }

    return () => es.close()
  }, [enabled, queryClient, onPing])
}
