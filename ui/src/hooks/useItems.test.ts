import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useCreateItem, useUpdateItem, useDeleteItem, itemKeys } from './useItems'
import * as api from '../lib/api'
import type { Item } from '../types'

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
  vi.resetAllMocks()
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
  it('calls DELETE /api/items/:id via apiFetch', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useDeleteItem(), { wrapper })
    result.current.mutate('item-xyz')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledWith('/api/items/item-xyz', { method: 'DELETE' })
  })
})

// ─── itemKeys ─────────────────────────────────────────────────────────────────

describe('itemKeys', () => {
  it('list key includes sprintId when provided', () => {
    expect(itemKeys.list('sprint-1')).toContain('sprint-1')
  })

  it('list key without sprintId shares prefix with all key', () => {
    expect(itemKeys.list(undefined)[0]).toBe(itemKeys.all[0])
  })
})
