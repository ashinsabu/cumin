import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useCreateItem, useUpdateItem, useDeleteItem, useBacklogItems, itemKeys } from './useItems'
import * as api from '../lib/api'
import type { Item } from '../types'

// Mock the apiFetch module — tests control return values per-test.
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}))

const mockApiFetch = vi.mocked(api.apiFetch)

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    display_id: 'WRK-1',
    title: 'Test item',
    priority: 4,
    status_id: 'status-1',
    position: 0,
    epic_id: null,
    sprint_id: null,
    project_id: 'proj-1',
    estimate_minutes: null,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── useBacklogItems ──────────────────────────────────────────────────────────

describe('useBacklogItems', () => {
  it('fetches from /api/items/backlog and returns the items array', async () => {
    const items = [makeItem({ id: 'i1' }), makeItem({ id: 'i2' })]
    mockApiFetch.mockResolvedValueOnce({ items })

    const { result } = renderHook(() => useBacklogItems(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/api/items/backlog')
    expect(result.current.data).toEqual(items)
  })

  it('returns undefined while loading', () => {
    // Never resolves — stays in loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useBacklogItems(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})

// ─── useCreateItem ────────────────────────────────────────────────────────────

describe('useCreateItem', () => {
  it('calls POST /api/items with the provided payload', async () => {
    const newItem = makeItem({ title: 'New task' })
    mockApiFetch.mockResolvedValueOnce(newItem)

    const { result } = renderHook(() => useCreateItem(), { wrapper })

    result.current.mutate({ title: 'New task', project_id: 'proj-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/api/items', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task', project_id: 'proj-1' }),
    })
  })

  it('exposes the returned item on success', async () => {
    const newItem = makeItem({ id: 'new-id', title: 'Created' })
    mockApiFetch.mockResolvedValueOnce(newItem)

    const { result } = renderHook(() => useCreateItem(), { wrapper })
    result.current.mutate({ title: 'Created', project_id: 'p1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(newItem)
  })

  it('reflects error when apiFetch rejects', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('400 Bad Request'))

    const { result } = renderHook(() => useCreateItem(), { wrapper })
    result.current.mutate({ title: '', project_id: 'p1' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('400 Bad Request')
  })
})

// ─── useUpdateItem ────────────────────────────────────────────────────────────

describe('useUpdateItem', () => {
  it('calls PATCH /api/items/:id with the payload', async () => {
    const updatedItem = makeItem({ title: 'Updated' })
    mockApiFetch.mockResolvedValueOnce(updatedItem)

    const { result } = renderHook(() => useUpdateItem(), { wrapper })
    result.current.mutate({ id: 'item-1', payload: { title: 'Updated' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/api/items/item-1', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
    })
  })

  it('uses the correct item ID in the URL', async () => {
    mockApiFetch.mockResolvedValueOnce(makeItem({ id: 'abc-123' }))

    const { result } = renderHook(() => useUpdateItem(), { wrapper })
    result.current.mutate({ id: 'abc-123', payload: { priority: 0 } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining('abc-123'),
      expect.anything(),
    )
  })
})

// ─── useDeleteItem ────────────────────────────────────────────────────────────

describe('useDeleteItem', () => {
  it('calls DELETE /api/items/:id', async () => {
    // useDeleteItem uses fetch directly, not apiFetch
    const mockFetch = vi.fn().mockResolvedValue({ ok: true } as Response)
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useDeleteItem(), { wrapper })
    result.current.mutate('item-xyz')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/items/item-xyz'),
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )

    vi.unstubAllGlobals()
  })
})

// ─── itemKeys ─────────────────────────────────────────────────────────────────

describe('itemKeys', () => {
  it('list key includes sprintId when provided', () => {
    expect(itemKeys.list('sprint-1')).toContain('sprint-1')
  })

  it('list key without sprintId matches backlog key prefix', () => {
    const listKey = itemKeys.list(undefined)
    const allKey = itemKeys.all
    expect(listKey[0]).toBe(allKey[0])
  })

  it('backlog key is stable', () => {
    expect(itemKeys.backlog).toEqual(['items', 'backlog'])
  })
})
