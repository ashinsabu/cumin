import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ToastProvider, useToast } from './ToastContext'

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>

// Regression: reloading during the undo window cancelled the timer, so the deferred action (e.g. queue dismiss) never ran.
describe('ToastProvider', () => {
  it('commits pending actions when the page is hidden', () => {
    const onCommit = vi.fn(async () => {})
    const { result } = renderHook(() => useToast(), { wrapper })
    act(() => result.current.push({ message: 'Removed', onCommit }))
    window.dispatchEvent(new Event('pagehide'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
