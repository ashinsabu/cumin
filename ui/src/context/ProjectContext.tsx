import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useProjects } from '../hooks/useProjects'
import { useAuth } from './AuthContext'
import { usePersistentState } from '../hooks/usePersistentState'
import type { Project } from '../types'

type ProjectContextValue = {
  selectedProject: Project | undefined
  setSelectedProjectId: (id: string) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Mounted above the auth gate: only fetch once signed in, and re-render on identity change so the
  // query is rebuilt after AuthProvider clears the cache (see AuthContext.applyUser).
  const { user } = useAuth()
  const { data: projects = [] } = useProjects({ enabled: !!user })
  const [selectedId, setSelectedId] = usePersistentState<string | null>('cumin.selectedProjectId', null)

  const selectedProject =
    (selectedId ? projects.find((p) => p.id === selectedId) : undefined) ?? projects[0]

  // Auto-correct stale stored ID (e.g. project was deleted)
  useEffect(() => {
    if (selectedProject && selectedProject.id !== selectedId) {
      setSelectedId(selectedProject.id)
    }
  }, [selectedProject, selectedId, setSelectedId])

  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProjectId: setSelectedId }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useSelectedProject(): [Project | undefined, (id: string) => void] {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useSelectedProject must be used within ProjectProvider')
  return [ctx.selectedProject, ctx.setSelectedProjectId]
}
