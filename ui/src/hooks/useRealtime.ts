import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { authFetch } from '../lib/auth'
import { readSSE } from '../lib/sse'

const QUERY_KEYS = ['items', 'sprints', 'epics', 'projects', 'board'] as const
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30_000

/**
 * Keeps a persistent SSE connection to /api/events and invalidates active queries on each ping.
 * Safe to do on your own mutations too — mutations update the cache via setQueryData first, so the
 * refetch returns identical data and TanStack's structural sharing suppresses any re-render.
 *
 * The stream is read with fetch (not EventSource) so it can carry the Bearer token; reconnects use
 * exponential backoff.
 */
export function useRealtime(enabled: boolean, onPing?: () => void) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    let failures = 0

    const onFailure = (reason: unknown) => {
      if (controller.signal.aborted) return
      failures += 1
      console.warn('[realtime] SSE error — will reconnect', reason)
      // Report after 3 consecutive failures to avoid noise from transient reconnects
      if (failures === 3) {
        Sentry.captureException(new Error('SSE /api/events persistent failure'), {
          extra: { consecutiveErrors: failures },
        })
      }
    }

    const run = async () => {
      while (!controller.signal.aborted) {
        try {
          const res = await authFetch('/api/events', {
            headers: { Accept: 'text/event-stream' },
            signal: controller.signal,
          })
          if (!res.ok || !res.body) {
            onFailure(`status ${res.status}`)
          } else {
            failures = 0
            console.debug('[realtime] SSE connected')
            await readSSE(res.body, () => {
              for (const key of QUERY_KEYS) {
                queryClient.invalidateQueries({ queryKey: [key], refetchType: 'active' })
              }
              onPing?.()
            })
            onFailure('stream ended')
          }
        } catch (err) {
          onFailure(err)
        }
        if (controller.signal.aborted) return
        const delay = Math.min(BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), MAX_DELAY_MS)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    void run()

    return () => controller.abort()
  }, [enabled, queryClient, onPing])
}
