import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'

export type ViewFilters = {
  project_id?: string
  epic_id?: string
  status_id?: string
  priority?: number
  hide_done?: boolean
}

export type SavedView = {
  id: string
  board_id: string
  name: string
  filters: ViewFilters
  position: number
  created_at: string
}

export const viewKeys = {
  all: ['views'] as const,
}

export function useSavedViews() {
  return useQuery({
    queryKey: viewKeys.all,
    queryFn: () => apiFetch<{ views: SavedView[] }>('/api/views').then((d) => d.views),
  })
}

export function useCreateView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; filters: ViewFilters }) =>
      apiFetch<SavedView>('/api/views', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewKeys.all }),
  })
}

export function useDeleteView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/views/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewKeys.all }),
  })
}
