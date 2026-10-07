import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const QUERY_KEYS = ['items', 'sprints', 'epics', 'projects', 'board'] as const

/**
 * Opens a persistent SSE connection to /api/events and invalidates active
 * TanStack Query caches on each ping. Only connects when enabled=true
 * (controlled by FEATURE_FLAGS=realtime). EventSource reconnects automatically
 * on disconnect — no manual retry logic needed.
 */
export function useRealtime(enabled: boolean, onPing?: () => void) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const API = import.meta.env.VITE_API_URL ?? ''
    const es = new EventSource(`${API}/api/events`, { withCredentials: true })

    es.onmessage = () => {
      for (const key of QUERY_KEYS) {
        // refetchType: 'none' — mark stale only, don't trigger an immediate refetch.
        // Your own mutations update the cache directly; SSE is for other clients.
        // Stale queries refetch on next focus/navigation.
        queryClient.invalidateQueries({ queryKey: [key], refetchType: 'none' })
      }
      onPing?.()
    }

    return () => es.close()
  }, [enabled, queryClient, onPing])
}
