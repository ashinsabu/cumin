import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from './ToastContext'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { itemKeys } from '../hooks/useItems'
import { epicKeys } from '../hooks/useEpics'
import { projectKeys } from '../hooks/useProjects'
import type { Item, Epic } from '../types'

const API = import.meta.env.VITE_API_URL ?? ''

// Re-export payload types so existing import sites don't break
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
  selectedItem: Item | null
  selectItem: (item: Item | null) => void
  selectedEpic: Epic | null
  selectEpic: (epic: Epic | null) => void
  deleteItem: (id: string) => Promise<void>
  deleteEpic: (id: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
}

const BoardContext = createContext<BoardContextValue | null>(null)

export function BoardProvider({ children }: { children: ReactNode }) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const { push: pushToast } = useToast()
  const qc = useQueryClient()

  // Sync selectedItem with URL ?item= param
  useEffect(() => {
    const itemParam = searchParams.get('item')
    if (!itemParam) {
      setSelectedItem(null)
      return
    }
    // Find the item across all item caches
    const allItemQueries = qc.getQueriesData<Item[]>({ queryKey: itemKeys.all })
    let found: Item | undefined
    for (const [, data] of allItemQueries) {
      found = data?.find((i) => i.display_id === itemParam)
      if (found) break
    }
    if (found) {
      setSelectedItem(found)
    } else {
      setSearchParams((prev) => { prev.delete('item'); return prev }, { replace: true })
    }
  }, [searchParams])

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

  const selectEpic = useCallback((epic: Epic | null) => {
    setSelectedEpic(epic)
  }, [])

  // ── Undo-delete wrappers ──────────────────────────────────────────────────

  const deleteItem = useCallback(async (id: string): Promise<void> => {
    // Snapshot from cache before optimistic removal
    const allItemQueries = qc.getQueriesData<Item[]>({ queryKey: itemKeys.all })
    let snapshot: Item | undefined
    for (const [, data] of allItemQueries) {
      snapshot = data?.find((i) => i.id === id)
      if (snapshot) break
    }

    // Optimistic removal from all item caches
    qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) =>
      old?.filter((i) => i.id !== id),
    )

    const res = await fetch(`${API}/api/items/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      qc.invalidateQueries({ queryKey: itemKeys.all })
      return
    }

    pushToast({
      message: snapshot?.title ? `"${snapshot.title}" deleted` : 'Item deleted',
      undo: snapshot
        ? async () => {
            await apiFetch(`/api/items/${id}/restore`, { method: 'POST' })
            qc.invalidateQueries({ queryKey: itemKeys.all })
          }
        : undefined,
    })
  }, [qc, pushToast])

  const deleteEpic = useCallback(async (id: string): Promise<void> => {
    // Snapshot from cache
    const allEpicQueries = qc.getQueriesData<Epic[]>({ queryKey: epicKeys.all })
    let epicSnap: Epic | undefined
    for (const [, data] of allEpicQueries) {
      epicSnap = data?.find((e) => e.id === id)
      if (epicSnap) break
    }

    // Optimistic removal
    qc.setQueriesData<Epic[]>({ queryKey: epicKeys.all }, (old) =>
      old?.filter((e) => e.id !== id),
    )
    qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) =>
      old?.filter((i) => i.epic_id !== id),
    )

    const res = await fetch(`${API}/api/epics/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      qc.invalidateQueries({ queryKey: epicKeys.all })
      qc.invalidateQueries({ queryKey: itemKeys.all })
      return
    }

    pushToast({
      message: epicSnap?.name ? `"${epicSnap.name}" deleted` : 'Epic deleted',
      undo: epicSnap
        ? async () => {
            await apiFetch(`/api/epics/${id}/restore`, { method: 'POST' })
            qc.invalidateQueries({ queryKey: epicKeys.all })
            qc.invalidateQueries({ queryKey: itemKeys.all })
          }
        : undefined,
    })
  }, [qc, pushToast])

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    // Snapshot from cache
    const allProjectQueries = qc.getQueriesData<any[]>({ queryKey: projectKeys.all })
    let projSnap: any
    for (const [, data] of allProjectQueries) {
      projSnap = data?.find((p: any) => p.id === id)
      if (projSnap) break
    }

    // Optimistic removal
    qc.setQueriesData<any[]>({ queryKey: projectKeys.all }, (old) =>
      old?.filter((p) => p.id !== id),
    )
    qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) =>
      old?.filter((i) => i.project_id !== id),
    )

    const res = await fetch(`${API}/api/projects/${id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      qc.invalidateQueries({ queryKey: itemKeys.all })
      return
    }

    pushToast({
      message: projSnap?.name ? `"${projSnap.name}" deleted` : 'Project deleted',
      undo: projSnap
        ? async () => {
            await apiFetch(`/api/projects/${id}/restore`, { method: 'POST' })
            qc.invalidateQueries({ queryKey: projectKeys.all })
            qc.invalidateQueries({ queryKey: itemKeys.all })
          }
        : undefined,
    })
  }, [qc, pushToast])

  return (
    <BoardContext.Provider
      value={{
        selectedItem,
        selectItem,
        selectedEpic,
        selectEpic,
        deleteItem,
        deleteEpic,
        deleteProject,
      }}
    >
      {children}
    </BoardContext.Provider>
  )
}

export function useBoard() {
  const ctx = useContext(BoardContext)
  if (!ctx) throw new Error('useBoard must be used within BoardProvider')
  return ctx
}
