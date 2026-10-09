import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { QueueItem } from '../types'
import { useToast } from './ToastContext'

const API = import.meta.env.VITE_API_URL ?? ''

// Mirrors server/queue/store.go urgencyScore — keeps optimistic items sorted correctly.
function computeUrgencyScore(title: string, priority: number, deadline: string | null | undefined): number {
  let deadlineScore = 0
  if (deadline) {
    const daysUntil = (new Date(deadline).getTime() - Date.now()) / 86_400_000
    deadlineScore = Math.max(0, 10 - daysUntil * 2)
  }
  let kwScore = 0
  const lower = title.toLowerCase()
  for (const kw of ['bug', 'prod', 'blocker', 'critical']) {
    if (lower.includes(kw)) kwScore += 2
  }
  return deadlineScore + kwScore + (4 - priority) * 2
}

type CreatePayload = {
  title: string
  notes?: string
  deadline?: string | null
  priority?: number
  estimate_minutes?: number | null
}

type UpdatePayload = {
  title: string
  notes?: string
  deadline?: string | null
  priority?: number
  estimate_minutes?: number | null
}

type PromotePayload = { project_id: string; status_id: string; epic_id?: string | null }

type QueueContextValue = {
  items: QueueItem[]
  loading: boolean
  createItem: (p: CreatePayload) => Promise<QueueItem>
  updateItem: (id: string, p: UpdatePayload) => Promise<void>
  archiveItem: (id: string) => void
  completeItem: (id: string) => Promise<void>
  reviveItem: (id: string) => Promise<void>
  reorderItems: (ids: string[]) => Promise<void>
  promoteItem: (id: string, p: PromotePayload) => Promise<{ item_id: string; item_display_id: string }>
}

const QueueContext = createContext<QueueContextValue | null>(null)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const { push: pushToast } = useToast()
  const itemsRef = useRef<QueueItem[]>([])
  useEffect(() => { itemsRef.current = items }, [items])

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/queue`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const createItem = useCallback(async (payload: CreatePayload): Promise<QueueItem> => {
    const tempId = crypto.randomUUID()
    const now = new Date().toISOString()
    const priority = payload.priority ?? 2
    const tempItem: QueueItem = {
      id: tempId,
      board_id: '',
      created_by: '',
      title: payload.title,
      notes: payload.notes ?? '',
      deadline: payload.deadline ?? null,
      priority,
      estimate_minutes: payload.estimate_minutes ?? null,
      position: 999,
      urgency_score: computeUrgencyScore(payload.title, priority, payload.deadline),
      promoted_item_id: null,
      completed_at: null,
      created_at: now,
    }
    setItems((prev) => [...prev, tempItem].sort((a, b) => b.urgency_score - a.urgency_score))

    try {
      const res = await fetch(`${API}/api/queue`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: 2, ...payload }),
      })
      if (!res.ok) throw new Error('Failed to create queue item')
      const item: QueueItem = await res.json()
      setItems((prev) => prev.map((i) => i.id === tempId ? item : i).sort((a, b) => b.urgency_score - a.urgency_score))
      return item
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.id !== tempId))
      throw e
    }
  }, [])

  const updateItem = useCallback(async (id: string, payload: UpdatePayload): Promise<void> => {
    const res = await fetch(`${API}/api/queue/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('Failed to update queue item')
    const updated: QueueItem = await res.json()
    setItems((prev) => prev.map((i) => i.id === id ? updated : i).sort((a, b) => b.urgency_score - a.urgency_score))
  }, [])

  const reorderItems = useCallback(async (ids: string[]): Promise<void> => {
    // Optimistic: reorder items in state by assigning new positions
    setItems(prev => {
      const posMap = new Map(ids.map((id, i) => [id, i]))
      return [...prev]
        .map(item => ({ ...item, position: posMap.get(item.id) ?? item.position }))
        .sort((a, b) => a.position - b.position)
    })
    await fetch(`${API}/api/queue/reorder`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ids }),
    })
  }, [])

  const archiveItem = useCallback((id: string): void => {
    const snapshot = itemsRef.current.find(i => i.id === id)
    setItems(prev => prev.filter(i => i.id !== id))
    pushToast({
      message: 'Removed from queue',
      undo: snapshot ? () => {
        setItems(prev => [...prev, snapshot].sort((a, b) => b.urgency_score - a.urgency_score))
      } : undefined,
      onCommit: () => fetch(`${API}/api/queue/${id}`, { method: 'DELETE', credentials: 'include' }).then(() => {}),
    })
  }, [pushToast])

  const completeItem = useCallback(async (id: string): Promise<void> => {
    setItems((prev) => prev.filter((i) => i.id !== id))
    await fetch(`${API}/api/queue/${id}/complete`, { method: 'POST', credentials: 'include' })
  }, [])

  const reviveItem = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`${API}/api/queue/${id}/revive`, { method: 'POST', credentials: 'include' })
    if (!res.ok) throw new Error('Failed to revive queue item')
    const revived: QueueItem = await res.json()
    setItems((prev) => prev.map((i) => i.id === id ? revived : i))
  }, [])

  const promoteItem = useCallback(async (id: string, payload: PromotePayload) => {
    const res = await fetch(`${API}/api/queue/${id}/promote`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error('Failed to convert queue item')
    const result = await res.json()
    setItems((prev) => prev.filter((i) => i.id !== id))
    return result
  }, [])

  return (
    <QueueContext.Provider value={{ items, loading, createItem, updateItem, archiveItem, completeItem, reviveItem, reorderItems, promoteItem }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueue() {
  const ctx = useContext(QueueContext)
  if (!ctx) throw new Error('useQueue must be used within QueueProvider')
  return ctx
}
