import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const authFetch = vi.hoisted(() => vi.fn())
vi.mock('../lib/auth', () => ({ authFetch }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('./ToastContext', () => ({ useToast: () => ({ push: vi.fn() }) }))

import { QueueProvider, useQueue } from './QueueContext'

const row = (id: string) => ({ id, title: id, notes: '', priority: 2, estimate_minutes: null, position: 0, urgency_score: 0, created_at: new Date().toISOString(), attention: { level: 'calm' } })
const listResponse = (ids: string[]) => ({ ok: true, json: async () => ({ items: ids.map(row), summary: null }) })
const wrapper = ({ children }: { children: ReactNode }) => <QueueProvider>{children}</QueueProvider>

beforeEach(() => { authFetch.mockReset() })

// Regression: periodic/focus refetches ran inside the 5s archive-undo window and brought the dismissed item back.
describe('QueueProvider refetch', () => {
  it('does not resurrect an item that is in its archive-undo window', async () => {
    authFetch.mockResolvedValue(listResponse(['a', 'b']))
    const { result } = renderHook(() => useQueue(), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(2))

    act(() => result.current.archiveItem('a'))
    expect(result.current.items.map((i) => i.id)).toEqual(['b'])

    // A refetch lands while the DELETE has not been sent yet: the server still lists "a".
    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(authFetch.mock.calls.length).toBeGreaterThan(1))
    await act(async () => { await Promise.resolve() })
    expect(result.current.items.map((i) => i.id)).toEqual(['b'])
  })
})
