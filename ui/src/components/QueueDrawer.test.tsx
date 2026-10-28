import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateItem = vi.fn(async () => {})
const queueState = vi.hoisted(() => ({ items: [] as unknown[], summary: null as unknown }))
vi.mock('../context/QueueContext', () => ({ useQueue: () => ({ updateItem, promoteItem: vi.fn(), loading: false, ...queueState }) }))
vi.mock('../hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))
vi.mock('../hooks/useBoardQueries', () => ({ useBoardStatuses: () => ({ data: [] }) }))
vi.mock('../hooks/useEpics', () => ({ useEpics: () => ({ data: [] }) }))
vi.mock('../hooks/useSprints', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('../lib/auth', () => ({ authFetch: vi.fn() }))

import { ExpandedEditor, QueueDrawer, QueueMobileTrigger } from './QueueDrawer'

const item = { id: 'q1', title: 'Feat', notes: '', priority: 2, estimate_minutes: null } as never

beforeEach(() => { updateItem.mockClear() })

// Regression: changing priority in the queue editor never saved, because only title/notes saved on blur.
describe('queue ExpandedEditor', () => {
  it('saves a priority change without needing a title/notes blur', async () => {
    render(<ExpandedEditor item={item} />)
    fireEvent.click(screen.getByText('P0'))
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('q1', expect.objectContaining({ priority: 0 })), { timeout: 2000 })
  })
})


// The header meter and collapsed-tab badge come from the server's attention model, not a client-side score.
describe('queue attention', () => {
  beforeEach(() => {
    queueState.items = []
    queueState.summary = null
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  })
  const fresh = new Date().toISOString()
  const mk = (id: string, level: string) => ({ id, title: id, notes: '', priority: 2, estimate_minutes: 60, position: 0, urgency_score: 0, created_at: fresh, attention: { level, reason: 'r' } })

  it('badges only the items the server says will not fit today', () => {
    queueState.items = [mk('a', 'pulse'), mk('b', 'watch'), mk('c', 'calm')]
    render(<QueueMobileTrigger onToggle={() => {}} />)
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('shows planned time against the day budget, flagging unestimated items', () => {
    queueState.items = [mk('a', 'calm')]
    queueState.summary = { planned_minutes: 330, budget_minutes: 480, unestimated_count: 2, minutes_left_today: 600 }
    render(<QueueDrawer open onToggle={() => {}} />)
    expect(screen.getByText('5h 30m / 8h +2?')).toBeTruthy()
  })
})
