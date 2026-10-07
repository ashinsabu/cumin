import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { Item } from '../types'

export const itemKeys = {
  all: ['items'] as const,
  list: (sprintId?: string) => ['items', sprintId] as const,
  backlog: ['items', 'backlog'] as const,
}

export function useItems(sprintId?: string) {
  return useQuery({
    queryKey: itemKeys.list(sprintId),
    queryFn: () =>
      apiFetch<{ items: Item[] }>(sprintId ? `/api/items?sprint_id=${sprintId}` : '/api/items').then(
        (d) => d.items,
      ),
  })
}

export function useBacklogItems() {
  return useQuery({
    queryKey: itemKeys.backlog,
    queryFn: () => apiFetch<{ items: Item[] }>('/api/items/backlog').then((d) => d.items),
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
      apiFetch(`/api/items/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ status_id: statusId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useDeleteItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/items/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      }),
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
