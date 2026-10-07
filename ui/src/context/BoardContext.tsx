import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useToast } from './ToastContext'
import { useSearchParams } from 'react-router-dom'
import type { Item, Status, Epic, Sprint, Board, Project } from '../types'

const API = import.meta.env.VITE_API_URL ?? ''

export type CreateItemPayload = {
  title: string
  project_id: string
  epic_id?: string | null
  priority?: number
  estimate_minutes?: number | null
}

export type CreateProjectPayload = {
  name: string
  prefix: string
  color: string
  description?: string
}

export type CreateEpicPayload = {
  name: string
  type: 'recurring' | 'goal' | 'catchall'
  color: string
  description?: string
  deadline?: string | null
}

export type UpdateItemPayload = {
  title?: string
  epic_id?: string | null
  clear_epic?: boolean
  priority?: number
  estimate_minutes?: number | null
  status_id?: string
}

type BoardContextValue = {
  board: Board | null
  items: Item[]
  statuses: Status[]
  epics: Epic[]
  projects: Project[]
  activeSprint: Sprint | null
  loading: boolean
  moveItem: (itemId: string, toStatusId: string) => void
  createItem: (payload: CreateItemPayload) => Promise<Item>
  updateItem: (id: string, payload: UpdateItemPayload) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  createProject: (payload: CreateProjectPayload) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  createEpic: (payload: CreateEpicPayload) => Promise<Epic>
  deleteEpic: (id: string) => Promise<void>
  selectedItem: Item | null
  selectItem: (item: Item | null) => void
  selectedEpic: Epic | null
  selectEpic: (epic: Epic | null) => void
  refresh: () => void
}

const BoardContext = createContext<BoardContextValue | null>(null)

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const { push: pushToast } = useToast()

  const itemsRef = useRef<Item[]>([])
  const epicsRef = useRef<Epic[]>([])
  const projectsRef = useRef<Project[]>([])

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { epicsRef.current = epics }, [epics])
  useEffect(() => { projectsRef.current = projects }, [projects])

  const fetchAll = useCallback(async () => {
    try {
      const opts = { credentials: 'include' as const }
      const [boardRes, statusRes, epicRes, sprintRes, itemRes, projectRes] = await Promise.all([
        fetch(`${API}/api/board`, opts),
        fetch(`${API}/api/board/statuses`, opts),
        fetch(`${API}/api/epics`, opts),
        fetch(`${API}/api/sprints/active`, opts),
        fetch(`${API}/api/items`, opts),
        fetch(`${API}/api/projects`, opts),
      ])

      if (boardRes.ok) setBoard(await boardRes.json())
      if (statusRes.ok) {
        const data = await statusRes.json()
        setStatuses(data.statuses || [])
      }
      if (epicRes.ok) {
        const data = await epicRes.json()
        setEpics(data.epics || [])
      }
      if (sprintRes.ok) setActiveSprint(await sprintRes.json())
      if (itemRes.ok) {
        const data = await itemRes.json()
        setItems(data.items || [])
      }
      if (projectRes.ok) {
        const data = await projectRes.json()
        setProjects(data.projects || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const itemParam = searchParams.get('item')
    if (itemParam) {
      const found = items.find((i) => i.display_id === itemParam)
      if (found) {
        setSelectedItem(found)
      } else {
        setSearchParams((prev) => { prev.delete('item'); return prev }, { replace: true })
      }
    } else {
      setSelectedItem(null)
    }
  }, [searchParams, items])

  const selectItem = useCallback((item: Item | null) => {
    setSelectedItem(item)
    setSearchParams((prev) => {
      if (item) {
        prev.set('item', item.display_id)
      } else {
        prev.delete('item')
      }
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const moveItem = useCallback(async (itemId: string, toStatusId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status_id: toStatusId } : item
      )
    )
    await fetch(`${API}/api/items/${itemId}/move`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_id: toStatusId }),
    })
  }, [])

  const createItem = useCallback(async (payload: CreateItemPayload): Promise<Item> => {
    const res = await fetch(`${API}/api/items`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create item')
    }
    const item: Item = await res.json()
    setItems((prev) => [...prev, item])
    return item
  }, [])

  const updateItem = useCallback(async (id: string, payload: UpdateItemPayload): Promise<void> => {
    setItems((prev) => prev.map((i) => {
      if (i.id !== id) return i
      const merged = { ...i, ...payload }
      if (payload.clear_epic) { merged.epic_id = null; merged.epic_name = undefined; merged.epic_color = undefined }
      if (payload.status_id && payload.status_id !== i.status_id) { merged.time_in_status_minutes = 0 }
      return merged
    }))
    try {
      const res = await fetch(`${API}/api/items/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to update item')
      }
      const updated: Item = await res.json()
      setItems((prev) => prev.map((i) => i.id === id ? updated : i))
    } catch (err) {
      await fetchAll()
      throw err
    }
  }, [fetchAll])

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    const snapshot = itemsRef.current.find(i => i.id === id)
    setItems(prev => prev.filter(i => i.id !== id))
    const res = await fetch(`${API}/api/items/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      if (snapshot) setItems(prev => [...prev, snapshot])
      return
    }
    pushToast({
      message: snapshot?.title ? `"${snapshot.title}" deleted` : 'Item deleted',
      undo: snapshot ? async () => {
        setItems(prev => [...prev, snapshot])
        await fetch(`${API}/api/items/${id}/restore`, { method: 'POST', credentials: 'include' })
      } : undefined,
    })
  }, [pushToast])

  const createProject = useCallback(async (payload: CreateProjectPayload): Promise<Project> => {
    const res = await fetch(`${API}/api/projects`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create project')
    }
    const project: Project = await res.json()
    setProjects((prev) => [...prev, project])
    return project
  }, [])

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const projSnap = projectsRef.current.find(p => p.id === id)
    const itemsSnap = itemsRef.current.filter(i => i.project_id === id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setItems(prev => prev.filter(i => i.project_id !== id))
    const res = await fetch(`${API}/api/projects/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      if (projSnap) setProjects(prev => [...prev, projSnap])
      setItems(prev => [...prev, ...itemsSnap])
      return
    }
    pushToast({
      message: projSnap?.name ? `"${projSnap.name}" deleted` : 'Project deleted',
      undo: projSnap ? async () => {
        setProjects(prev => [...prev, projSnap])
        setItems(prev => [...prev, ...itemsSnap])
        await fetch(`${API}/api/projects/${id}/restore`, { method: 'POST', credentials: 'include' })
      } : undefined,
    })
  }, [pushToast])

  const createEpic = useCallback(async (payload: CreateEpicPayload): Promise<Epic> => {
    const res = await fetch(`${API}/api/epics`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create epic')
    }
    const epic: Epic = await res.json()
    setEpics((prev) => [...prev, epic])
    return epic
  }, [])

  const deleteEpic = useCallback(async (id: string): Promise<void> => {
    const epicSnap = epicsRef.current.find(e => e.id === id)
    const itemsSnap = itemsRef.current.filter(i => i.epic_id === id)
    setEpics(prev => prev.filter(e => e.id !== id))
    setItems(prev => prev.filter(i => i.epic_id !== id))
    const res = await fetch(`${API}/api/epics/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      if (epicSnap) setEpics(prev => [...prev, epicSnap])
      setItems(prev => [...prev, ...itemsSnap])
      return
    }
    pushToast({
      message: epicSnap?.name ? `"${epicSnap.name}" deleted` : 'Epic deleted',
      undo: epicSnap ? async () => {
        setEpics(prev => [...prev, epicSnap])
        setItems(prev => [...prev, ...itemsSnap])
        await fetch(`${API}/api/epics/${id}/restore`, { method: 'POST', credentials: 'include' })
      } : undefined,
    })
  }, [pushToast])

  return (
    <BoardContext.Provider value={{
      board,
      items,
      statuses,
      epics,
      projects,
      activeSprint,
      loading,
      moveItem,
      createItem,
      updateItem,
      deleteItem,
      createProject,
      deleteProject,
      createEpic,
      deleteEpic,
      selectedItem,
      selectItem,
      selectedEpic,
      selectEpic: setSelectedEpic,
      refresh: fetchAll,
    }}>
      {children}
    </BoardContext.Provider>
  )
}

export function useBoard() {
  const ctx = useContext(BoardContext)
  if (!ctx) throw new Error('useBoard must be used within BoardProvider')
  return ctx
}
