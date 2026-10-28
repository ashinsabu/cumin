import { describe, it, expect } from 'vitest'
import { scopeItems } from './boardScope'
import type { Item } from '../types'

const mk = (id: string, sprint_id: string | null) => ({ id, sprint_id }) as Item

// Regression (user feedback 2026-10-28): the Board showed every item in the project while the header
// claimed a sprint, so "done 1/20" and the columns contradicted the sprint card.
describe('scopeItems', () => {
  const items = [mk('a', 's1'), mk('b', null), mk('c', 's0')]
  it('shows only the active sprint by default', () => {
    expect(scopeItems(items, 's1', 'sprint').map((i) => i.id)).toEqual(['a'])
  })
  it('shows everything when widened', () => {
    expect(scopeItems(items, 's1', 'all')).toHaveLength(3)
  })
  it('shows everything when no sprint is active', () => {
    expect(scopeItems(items, null, 'sprint')).toHaveLength(3)
  })
})
