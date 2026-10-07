import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useItems, useMoveItem, itemKeys } from './useItems'
import * as api from '../lib/api'
import type { Item } from '../types'

vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

const mockApiFetch = vi.mocked(api.apiFetch)

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    display_id: 'WRK-1',
    title: 'Test item',
    priority: 4,
    status_id: 'todo',
    position: 0,
    epic_id: null,
    sprint_id: null,
    project_id: 'proj-1',
    estimate_minutes: null,
    ...overrides,
  }
}

// Shared QueryClient so useItems + useMoveItem see the same cache.
let qc: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

// ─── useMoveItem ──────────────────────────────────────────────────────────────

describe('useMoveItem', () => {
  it('calls POST /api/items/{id}/move with status_id in the body', async () => {
    const moved = makeItem({ status_id: 'done' })
    mockApiFetch.mockResolvedValueOnce(moved)

    const { result } = renderHook(() => useMoveItem(), { wrapper })
    result.current.mutate({ id: 'item-1', statusId: 'done' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/api/items/item-1/move', {
      method: 'POST',
      body: JSON.stringify({ status_id: 'done' }),
    })
  })

  it('applies optimistic status_id to the items cache before the server responds', async () => {
    const original = makeItem({ id: 'i1', status_id: 'todo' })

    // Seed the items cache so onMutate has something to update.
    qc.setQueryData(itemKeys.list(undefined), [original])

    // Mutation never resolves — lets us inspect cache mid-flight.
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useMoveItem(), { wrapper })

    act(() => {
      result.current.mutate({ id: 'i1', statusId: 'done' })
    })

    // Wait for onMutate to complete (it's async — awaits cancelQueries).
    await waitFor(() => result.current.isPending)

    const cached = qc.getQueryData<Item[]>(itemKeys.list(undefined))
    expect(cached?.find((i) => i.id === 'i1')?.status_id).toBe('done')
  })

  it('replaces optimistic data with the authoritative server response on success', async () => {
    const original = makeItem({ id: 'i1', status_id: 'todo' })
    // Server response includes extra server-computed fields (e.g. time_in_status_minutes).
    const serverItem = makeItem({ id: 'i1', status_id: 'done', time_in_status_minutes: 0 })

    qc.setQueryData(itemKeys.list(undefined), [original])
    mockApiFetch.mockResolvedValueOnce(serverItem)

    const { result } = renderHook(() => useMoveItem(), { wrapper })
    result.current.mutate({ id: 'i1', statusId: 'done' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const cached = qc.getQueryData<Item[]>(itemKeys.list(undefined))
    expect(cached?.find((i) => i.id === 'i1')).toEqual(serverItem)
  })

  it('rolls back the cache to the pre-mutation snapshot on error', async () => {
    const original = makeItem({ id: 'i1', status_id: 'todo' })

    qc.setQueryData(itemKeys.list(undefined), [original])
    mockApiFetch.mockRejectedValueOnce(new Error('500 Server Error'))

    const { result } = renderHook(() => useMoveItem(), { wrapper })
    result.current.mutate({ id: 'i1', statusId: 'done' })

    await waitFor(() => expect(result.current.isError).toBe(true))

    // Cache must be restored to original (todo), not the optimistic (done).
    const cached = qc.getQueryData<Item[]>(itemKeys.list(undefined))
    expect(cached?.find((i) => i.id === 'i1')?.status_id).toBe('todo')
  })
})
