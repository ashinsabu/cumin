import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Item, Status, Epic, Sprint, Board } from '../types'
import { MOCK_ITEMS, MOCK_STATUSES, MOCK_EPICS, MOCK_SPRINT, MOCK_BOARD } from '../constants'

type BoardContextValue = {
  board: Board
  items: Item[]
  statuses: Status[]
  epics: Epic[]
  activeSprint: Sprint
  moveItem: (itemId: string, toStatusId: string) => void
  selectedItem: Item | null
  selectItem: (item: Item | null) => void
}

const BoardContext = createContext<BoardContextValue | null>(null)

export function BoardProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>(MOCK_ITEMS)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  const moveItem = useCallback((itemId: string, toStatusId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status_id: toStatusId, time_in_status_minutes: 0 } : item
      )
    )
  }, [])

  return (
    <BoardContext.Provider value={{
      board: MOCK_BOARD,
      items,
      statuses: MOCK_STATUSES,
      epics: MOCK_EPICS,
      activeSprint: MOCK_SPRINT,
      moveItem,
      selectedItem,
      selectItem: setSelectedItem,
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
