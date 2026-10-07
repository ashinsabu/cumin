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
        // refetchType: 'active' — only queries currently mounted refetch.
        // Background/stale queries are marked stale and refetch on next mount.
        queryClient.invalidateQueries({ queryKey: [key], refetchType: 'active' })
      }
      onPing?.()
    }

    return () => es.close()
  }, [enabled, queryClient, onPing])
}
