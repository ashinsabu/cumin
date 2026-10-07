import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { Sprint } from '../types'

const API = import.meta.env.VITE_API_URL ?? ''

export const sprintKeys = {
  all: ['sprints'] as const,
  list: () => [...sprintKeys.all, 'list'] as const,
  active: ['sprints', 'active'] as const,
}

export function useSprints() {
  return useQuery({
    queryKey: sprintKeys.list(),
    queryFn: () => apiFetch<{ sprints: Sprint[] }>('/api/sprints').then((d) => d.sprints),
  })
}

export function useActiveSprint() {
  return useQuery({
    queryKey: sprintKeys.active,
    queryFn: async (): Promise<Sprint | null> => {
      const res = await fetch(`${API}/api/sprints/active`, { credentials: 'include' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`${res.status} /api/sprints/active`)
      return res.json()
    },
  })
}

export function useCreateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: any) =>
      apiFetch<Sprint>('/api/sprints', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all })
    },
  })
}

export function useActivateSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Sprint>(`/api/sprints/${id}/activate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all })
    },
  })
}

export function useCloseSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Sprint>(`/api/sprints/${id}/close`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sprintKeys.all })
    },
  })
}
