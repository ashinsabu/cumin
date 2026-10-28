import type { Item } from '../types'

export type BoardScope = 'sprint' | 'all'

/**
 * The Board is the active sprint's work. Items outside the sprint live in the backlog and only
 * appear here when the user explicitly widens the scope (or when there is no active sprint).
 */
export function scopeItems(items: Item[], activeSprintId: string | null | undefined, scope: BoardScope): Item[] {
  if (!activeSprintId || scope === 'all') return items
  return items.filter((i) => i.sprint_id === activeSprintId)
}
