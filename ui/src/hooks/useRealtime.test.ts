import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRealtime } from './useRealtime'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/react'

const mockCaptureException = vi.mocked(Sentry.captureException)

// ─── EventSource mock ─────────────────────────────────────────────────────────

// Arrow functions can't be used as constructors, so we capture the instance
// via a regular function constructor — `this` is the newly created object.
let mockES: any

beforeEach(() => {
  mockES = null
  const MockCtor = vi.fn(function(this: any) {
    this.close = vi.fn()
    mockES = this
  })
  vi.stubGlobal('EventSource', MockCtor)
  mockCaptureException.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRealtime — Sentry capture on persistent SSE failure', () => {
  it('does not capture before 3 consecutive errors', () => {
    renderHook(() => useRealtime(true))

    mockES.onerror?.(new Event('error'))
    mockES.onerror?.(new Event('error'))

    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('captures exactly once at the 3rd consecutive error', () => {
    renderHook(() => useRealtime(true))

    mockES.onerror?.(new Event('error'))
    mockES.onerror?.(new Event('error'))
    mockES.onerror?.(new Event('error'))

    expect(mockCaptureException).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'SSE /api/events persistent failure' }),
      expect.objectContaining({ extra: { consecutiveErrors: 3 } }),
    )
  })

  it('does not fire again on subsequent errors after the 3rd', () => {
    renderHook(() => useRealtime(true))

    for (let i = 0; i < 6; i++) mockES.onerror?.(new Event('error'))

    // Should fire exactly once at error #3, not on 4, 5, 6
    expect(mockCaptureException).toHaveBeenCalledOnce()
  })

  it('resets error count on reconnect (onopen)', () => {
    renderHook(() => useRealtime(true))

    mockES.onerror?.(new Event('error'))
    mockES.onerror?.(new Event('error'))
    mockES.onopen?.()
    // 2 more errors — count restarted from 0, total is 2, no capture yet
    mockES.onerror?.(new Event('error'))
    mockES.onerror?.(new Event('error'))

    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('does nothing when disabled', () => {
    renderHook(() => useRealtime(false))

    // EventSource should not even be created when enabled=false
    expect(EventSource).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
