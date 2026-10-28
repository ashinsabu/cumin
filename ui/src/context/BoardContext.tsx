import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { itemKeys } from '../hooks/useItems'
import { useUndoable, softDelete } from '../hooks/useUndoable'
import { epicKeys } from '../hooks/useEpics'
import { projectKeys } from '../hooks/useProjects'
import type { Item, Epic } from '../types'


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
  // Store the display_id only — derive the full Item from the live cache so the
  // modal always reflects the latest server state (status moves, field updates, etc.)
  const [selectedItemDisplayId, setSelectedItemDisplayId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [selectedEpic, setSelectedEpic] = useState<Epic | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const qc = useQueryClient()

  // Keep selectedItem in sync with the cache. Runs on mount, when the selected ID
  // changes, and whenever any query cache entry updates (including setQueriesData
  // from mutations and invalidateQueries refetches).
  useEffect(() => {
    function syncFromCache() {
      if (!selectedItemDisplayId) {
        setSelectedItem(null)
        return
      }
      const allItemQueries = qc.getQueriesData<Item[]>({ queryKey: itemKeys.all })
      for (const [, data] of allItemQueries) {
        const found = data?.find((i) => i.display_id === selectedItemDisplayId)
        if (found) {
          setSelectedItem(found)
          return
        }
      }
    }
    syncFromCache()
    return qc.getQueryCache().subscribe(syncFromCache)
  }, [selectedItemDisplayId, qc])

  // Sync selected item display ID with URL ?item= param
  useEffect(() => {
    const itemParam = searchParams.get('item')
    setSelectedItemDisplayId(itemParam || null)
    if (!itemParam) return
    // If not in cache yet, clear the URL param
    const allItemQueries = qc.getQueriesData<Item[]>({ queryKey: itemKeys.all })
    const exists = allItemQueries.some(([, data]) => data?.some((i) => i.display_id === itemParam))
    if (!exists) {
      setSearchParams((prev) => { prev.delete('item'); return prev }, { replace: true })
    }
  }, [searchParams])

  const selectItem = useCallback((item: Item | null) => {
    setSelectedItemDisplayId(item?.display_id ?? null)
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

  type Target = { id: string; name?: string }

  // Snapshot from any cached list so the toast can name what was deleted.
  const nameFromCache = useCallback(<T extends { id: string }>(key: readonly unknown[], id: string, pick: (row: T) => string) => {
    for (const [, rows] of qc.getQueriesData<T[]>({ queryKey: key })) {
      const row = rows?.find((r) => r.id === id)
      if (row) return pick(row)
    }
  }, [qc])
  const invalidate = (...keys: readonly (readonly unknown[])[]) => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }))
  const deletedLabel = (kind: string) => (t: Target) => t.name ? `"${t.name}" deleted` : `${kind} deleted`

  const removeItem = useUndoable<Target>({
    label: deletedLabel('Item'),
    ...softDelete((t) => `/api/items/${t.id}`),
    apply: (t) => qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) => old?.filter((i) => i.id !== t.id)),
    revert: () => invalidate(itemKeys.all),
  })
  const removeEpic = useUndoable<Target>({
    label: deletedLabel('Epic'),
    ...softDelete((t) => `/api/epics/${t.id}`),
    apply: (t) => {
      qc.setQueriesData<Epic[]>({ queryKey: epicKeys.all }, (old) => old?.filter((e) => e.id !== t.id))
      qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) => old?.filter((i) => i.epic_id !== t.id))
    },
    revert: () => invalidate(epicKeys.all, itemKeys.all),
  })
  const removeProject = useUndoable<Target>({
    label: deletedLabel('Project'),
    ...softDelete((t) => `/api/projects/${t.id}`),
    apply: (t) => {
      qc.setQueriesData<{ id: string }[]>({ queryKey: projectKeys.all }, (old) => old?.filter((p) => p.id !== t.id))
      qc.setQueriesData<Item[]>({ queryKey: itemKeys.all }, (old) => old?.filter((i) => i.project_id !== t.id))
    },
    revert: () => invalidate(projectKeys.all, itemKeys.all),
  })

  const deleteItem = useCallback((id: string) => removeItem({ id, name: nameFromCache<Item>(itemKeys.all, id, (i) => i.title) }), [removeItem, nameFromCache])
  const deleteEpic = useCallback((id: string) => removeEpic({ id, name: nameFromCache<Epic>(epicKeys.all, id, (e) => e.name) }), [removeEpic, nameFromCache])
  const deleteProject = useCallback((id: string) => removeProject({ id, name: nameFromCache<{ id: string; name: string }>(projectKeys.all, id, (p) => p.name) }), [removeProject, nameFromCache])

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
