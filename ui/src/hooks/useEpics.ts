import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import { itemKeys } from './useItems'
import type { Epic } from '../types'

export const epicKeys = {
  all: ['epics'] as const,
  list: () => [...epicKeys.all, 'list'] as const,
}

export function useEpics() {
  return useQuery({
    queryKey: epicKeys.all,
    queryFn: () => apiFetch<{ epics: Epic[] }>('/api/epics').then((d) => d.epics),
  })
}

export function useCreateEpic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch<Epic>('/api/epics', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: epicKeys.all })
    },
  })
}

export function useUpdateEpic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      apiFetch<Epic>(`/api/epics/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: epicKeys.all })
    },
  })
}

export function useDeleteEpic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/epics/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: epicKeys.all })
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}

export function useRestoreEpic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/epics/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: epicKeys.all })
      qc.invalidateQueries({ queryKey: itemKeys.all })
    },
  })
}
