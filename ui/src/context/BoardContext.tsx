import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Item, Status, Epic, Sprint, Board } from '../types'

const API = ''

type BoardContextValue = {
  board: Board | null
  items: Item[]
  statuses: Status[]
  epics: Epic[]
  activeSprint: Sprint | null
  loading: boolean
  moveItem: (itemId: string, toStatusId: string) => void
  selectedItem: Item | null
  selectItem: (item: Item | null) => void
  refresh: () => void
}

const BoardContext = createContext<BoardContextValue | null>(null)

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const fetchAll = useCallback(async () => {
    try {
      const opts = { credentials: 'include' as const }
      const [boardRes, statusRes, epicRes, sprintRes, itemRes] = await Promise.all([
        fetch(`${API}/api/board`, opts),
        fetch(`${API}/api/board/statuses`, opts),
        fetch(`${API}/api/epics`, opts),
        fetch(`${API}/api/sprints/active`, opts),
        fetch(`${API}/api/items`, opts),
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

  return (
    <BoardContext.Provider value={{
      board,
      items,
      statuses,
      epics,
      activeSprint,
      loading,
      moveItem,
      selectedItem,
      selectItem,
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
