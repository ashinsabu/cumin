import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRealtime } from './useRealtime'

const invalidateQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}))
vi.mock('@sentry/react', () => ({ captureException: vi.fn() }))
vi.mock('../lib/auth', () => ({ authFetch: vi.fn() }))

import * as Sentry from '@sentry/react'
import { authFetch } from '../lib/auth'

const mockCapture = vi.mocked(Sentry.captureException)
const mockAuthFetch = vi.mocked(authFetch)

/** A stream the test can push SSE text into and end. */
function liveStream() {
  const enc = new TextEncoder()
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({ start: (c) => (ctrl = c) })
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    end: () => ctrl.close(),
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  invalidateQueries.mockReset()
  mockCapture.mockReset()
  mockAuthFetch.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('useRealtime', () => {
  it('does nothing when disabled', async () => {
    renderHook(() => useRealtime(false))
    await flush()
    expect(mockAuthFetch).not.toHaveBeenCalled()
  })

  it('connects through authFetch and invalidates every key on a ping', async () => {
    const s = liveStream()
    mockAuthFetch.mockResolvedValueOnce(s.response)
    const onPing = vi.fn()
    renderHook(() => useRealtime(true, onPing))
    await flush()

    expect(mockAuthFetch.mock.calls[0][0]).toBe('/api/events')
    s.push('data: ping\n\n')
    await flush()

    expect(invalidateQueries).toHaveBeenCalledTimes(5)
    expect(onPing).toHaveBeenCalledTimes(1)
  })

  it('ignores keepalive comments', async () => {
    const s = liveStream()
    mockAuthFetch.mockResolvedValueOnce(s.response)
    renderHook(() => useRealtime(true))
    await flush()
    s.push(': keepalive\n\n')
    await flush()
    expect(invalidateQueries).not.toHaveBeenCalled()
  })

  it('reconnects with backoff after the stream ends', async () => {
    const first = liveStream()
    mockAuthFetch.mockResolvedValueOnce(first.response).mockResolvedValue(liveStream().response)
    renderHook(() => useRealtime(true))
    await flush()
    first.end()
    await flush()
    expect(mockAuthFetch).toHaveBeenCalledTimes(1) // waiting out the backoff

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockAuthFetch).toHaveBeenCalledTimes(2)
  })

  it('reports to Sentry exactly once at the 3rd consecutive failure', async () => {
    mockAuthFetch.mockResolvedValue(new Response(null, { status: 503 }))
    renderHook(() => useRealtime(true))
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mockAuthFetch.mock.calls.length).toBeGreaterThanOrEqual(5)
    expect(mockCapture).toHaveBeenCalledOnce()
    expect(mockCapture).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'SSE /api/events persistent failure' }),
      expect.objectContaining({ extra: { consecutiveErrors: 3 } }),
    )
  })

  it('a successful connection resets the failure count', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(liveStream().response) // connects: count back to 0
    renderHook(() => useRealtime(true))
    await vi.advanceTimersByTimeAsync(10_000)

    expect(mockAuthFetch).toHaveBeenCalledTimes(3)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('stops reconnecting after unmount and aborts the request', async () => {
    mockAuthFetch.mockResolvedValue(new Response(null, { status: 503 }))
    const { unmount } = renderHook(() => useRealtime(true))
    await flush()
    const signal = mockAuthFetch.mock.calls[0][1]?.signal as AbortSignal
    unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(signal.aborted).toBe(true)
    expect(mockAuthFetch).toHaveBeenCalledTimes(1)
  })
})
