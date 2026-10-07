import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { Board, Status } from '../types'

export const boardKeys = {
  data: ['board'] as const,
  statuses: ['board', 'statuses'] as const,
}

export function useBoardData() {
  return useQuery({
    queryKey: boardKeys.data,
    queryFn: () => apiFetch<Board>('/api/board'),
  })
}

export function useBoardStatuses() {
  return useQuery({
    queryKey: boardKeys.statuses,
    queryFn: () =>
      apiFetch<{ statuses: Status[] }>('/api/board/statuses').then((d) => d.statuses),
  })
}

export function useUpdateBoard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch<Board>('/api/board', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.data })
    },
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch<Status>('/api/board/statuses', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.statuses })
    },
  })
}

export function useDeleteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/board/statuses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.statuses })
    },
  })
}

export function useReorderStatuses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch('/api/board/statuses/reorder', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.statuses })
    },
  })
}
