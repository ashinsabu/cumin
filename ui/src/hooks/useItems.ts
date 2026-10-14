import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { Item } from '../types'

export type ItemFilters = {
  projectId?: string
  sprintId?: string
}

export const itemKeys = {
  all: ['items'] as const,
  list: (f?: ItemFilters) => ['items', f?.projectId, f?.sprintId] as const,
}

export function useItems(filters?: ItemFilters) {
  return useQuery({
    queryKey: itemKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.sprintId) params.set('sprint_id', filters.sprintId)
      if (filters?.projectId) params.set('project_id', filters.projectId)
      const qs = params.toString()
      return apiFetch<{ items: Item[] }>(qs ? `/api/items?${qs}` : '/api/items').then((d) => d.items)
    },
  })
}

export function useCreateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch<Item>('/api/items', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useUpdateItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      apiFetch<Item>(`/api/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useMoveItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, statusId }: { id: string; statusId: string }) =>
      apiFetch<Item>(`/api/items/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ status_id: statusId }),
      }),
    onMutate: async ({ id, statusId }) => {
      // Cancel any in-flight GET /api/items BEFORE snapshotting and applying the
      // optimistic update. Without the await, a racing in-flight response could
      // resolve in the same microtask batch and overwrite our optimistic state —
      // causing the visible flicker-back. BoardView's pendingMoves local state
      // handles the immediate visual snap independently of this async flow.
      await qc.cancelQueries({ queryKey: itemKeys.all })
      const snapshot = qc.getQueriesData<Item[]>({ queryKey: itemKeys.all })
      qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old = []) =>
        old.map((i) => (i.id === id ? { ...i, status_id: statusId } : i)),
      )
      return { snapshot }
    },
    onSuccess: (updatedItem) => {
      // Replace optimistic data with authoritative server response.
      qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old = []) =>
        old.map((i) => (i.id === updatedItem.id ? updatedItem : i)),
      )
    },
    onError: (_err, _vars, ctx) => {
      // Roll back to pre-mutation state.
      if (ctx?.snapshot) {
        for (const [key, data] of ctx.snapshot) {
          qc.setQueryData(key, data)
        }
      }
    },
    onSettled: () => {
      // Background refresh to get fresh time_in_status for all cards.
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useRestoreItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/items/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}
