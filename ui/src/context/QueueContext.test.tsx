import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const authFetch = vi.hoisted(() => vi.fn())
const push = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ authFetch }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('./ToastContext', () => ({ useToast: () => ({ push }) }))

import { QueueProvider, useQueue } from './QueueContext'

const row = (id: string) => ({ id, title: id, notes: '', priority: 2, estimate_minutes: null, position: 0, urgency_score: 0, created_at: new Date().toISOString(), attention: { level: 'calm' } })
const listResponse = (ids: string[]) => ({ ok: true, json: async () => ({ items: ids.map(row), summary: null }) })
const wrapper = ({ children }: { children: ReactNode }) => <QueueProvider>{children}</QueueProvider>

beforeEach(() => { authFetch.mockReset() })

// Regression: periodic/focus refetches ran while a dismiss was still in flight and brought the dismissed item back.
describe('QueueProvider archive', () => {
  it('does not resurrect an item whose DELETE is still in flight', async () => {
    let finishDelete: (r: unknown) => void = () => {}
    authFetch.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Promise((r) => { finishDelete = r }) : Promise.resolve(listResponse(['a', 'b'])))
    const { result } = renderHook(() => useQueue(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.archiveItem('a'))
    expect(result.current.items.map((i) => i.id)).toEqual(['b'])

    // A refetch lands before the DELETE completes: the server still lists "a".
    const before = authFetch.mock.calls.length
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(authFetch.mock.calls.length).toBeGreaterThan(before))
    await act(async () => { await Promise.resolve() })
    expect(result.current.items.map((i) => i.id)).toEqual(['b'])
    await act(async () => { finishDelete({ ok: true }) })
  })

  it('puts the entry back when the DELETE fails', async () => {
    authFetch.mockImplementation((url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === 'DELETE' ? { ok: false } : listResponse(['a', 'b'])))
    const { result } = renderHook(() => useQueue(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))
    await act(async () => { result.current.archiveItem('a') })
    await waitFor(() => expect(result.current.items.map((i) => i.id).sort()).toEqual(['a', 'b']))
  })
})
