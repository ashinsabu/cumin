import { useEffect } from 'react'
import { useProjects } from './useProjects'
import { usePersistentState } from './usePersistentState'
import type { Project } from '../types'

const STORAGE_KEY = 'cumin.selectedProjectId'

export function useSelectedProject(): [Project | undefined, (id: string) => void] {
  const { data: projects = [] } = useProjects()
  const [selectedId, setSelectedId] = usePersistentState<string | null>(STORAGE_KEY, null)

  const current =
    (selectedId ? projects.find((p) => p.id === selectedId) : undefined) ?? projects[0]

  // Auto-correct stale ID (e.g. after a project is deleted)
  useEffect(() => {
    if (current && current.id !== selectedId) setSelectedId(current.id)
  }, [current, selectedId, setSelectedId])

  return [current, setSelectedId]
}
