import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateItem = vi.fn(async () => {})
const completeItem = vi.fn(async (_id: string) => {})
const archiveItems = vi.fn()
const queueState = vi.hoisted(() => ({ items: [] as unknown[], summary: null as unknown }))
vi.mock('../context/QueueContext', () => ({ useQueue: () => ({ updateItem, completeItem, archiveItems, promoteItem: vi.fn(), loading: false, ...queueState }) }))
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

// The word badges are gone: rows and the create form show the room left today in brackets, warn vs danger by level.
describe('queue room-left hint', () => {
  const fresh = new Date().toISOString()
  const mk = (id: string, level: string, room: number) => ({ id, title: id, notes: '', priority: 2, estimate_minutes: 180, position: 0, urgency_score: 0, created_at: fresh, attention: { level, reason: 'r', room_minutes: room } })

  beforeEach(() => {
    queueState.items = []
    queueState.summary = null
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} })
  })

  it('shows (X left today) next to the estimate: warn for watch, danger for pulse, nothing for calm', () => {
    queueState.items = [mk('w', 'watch', 210), mk('p', 'pulse', 120), mk('c', 'calm', 400)]
    render(<QueueDrawer open onToggle={() => {}} />)
    expect(screen.getByText('(3h 30m left today)').className).toContain('text-warn')
    expect(screen.getByText('(2h left today)').className).toContain('text-danger')
    expect(screen.queryByText(/6h 40m left today/)).toBeNull()
  })

  it('previews the same hint while typing an estimate for a new entry', () => {
    queueState.items = [mk('c', 'calm', 400)]
    // 3h left today, 1h already queued -> 2h of room for a new entry
    queueState.summary = { planned_minutes: 60, budget_minutes: 480, unestimated_count: 0, minutes_left_today: 180 }
    render(<QueueDrawer open onToggle={() => {}} />)
    fireEvent.click(screen.getByText('+'))
    fireEvent.click(screen.getByText('15m'))
    expect(screen.queryByText(/left today/)).toBeNull() // 1h45m of slack: no hint
    fireEvent.click(screen.getByText('1h'))
    fireEvent.change(screen.getByPlaceholderText('other'), { target: { value: '90m' } })
    expect(screen.getByText('(2h left today)').className).toContain('text-warn') // 30m of slack
    fireEvent.change(screen.getByPlaceholderText('other'), { target: { value: '3h' } })
    expect(screen.getByText('(2h left today)').className).toContain('text-danger')
  })
})

describe('queue mass selection', () => {
  const fresh = new Date().toISOString()
  const mk = (id: string, position: number) => ({ id, title: `task ${id}`, notes: '', priority: 2, estimate_minutes: null, position, urgency_score: 0, created_at: fresh, attention: { level: 'calm' } })

  beforeEach(() => {
    completeItem.mockReset()
    completeItem.mockResolvedValue(undefined)
    queueState.items = ['a', 'b', 'c', 'd'].map(mk)
    queueState.summary = null
    vi.stubGlobal('localStorage', { getItem: () => 'custom', setItem: () => {} })
  })

  it('shift-click selects the range, and Done completes exactly those entries then leaves select mode', async () => {
    render(<QueueDrawer open onToggle={() => {}} />)
    fireEvent.click(screen.getByText('Select'))
    fireEvent.click(screen.getByText('task a'))
    fireEvent.click(screen.getByText('task c'), { shiftKey: true })
    expect(screen.getByText('3 selected')).toBeTruthy()

    fireEvent.click(screen.getByText('✓ Done'))
    await waitFor(() => expect(completeItem).toHaveBeenCalledTimes(3))
    expect(completeItem.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b', 'c'])
    await waitFor(() => expect(screen.queryByText('3 selected')).toBeNull())
  })

  it('toggles from the checkbox itself, not only the title', () => {
    render(<QueueDrawer open onToggle={() => {}} />)
    fireEvent.click(screen.getByText('Select'))
    fireEvent.click(screen.getAllByRole('checkbox')[1].parentElement!)
    expect(screen.getByText('1 selected')).toBeTruthy()
  })

  it('bulk Dismiss goes through the undoable path in one call', () => {
    render(<QueueDrawer open onToggle={() => {}} />)
    fireEvent.click(screen.getByText('Select'))
    fireEvent.click(screen.getByText('task a'))
    fireEvent.click(screen.getByText('task b'))
    fireEvent.click(screen.getByText('× Dismiss'))
    expect(archiveItems).toHaveBeenCalledWith(['a', 'b'])
  })

  it('keeps failed entries selected so they can be retried', async () => {
    completeItem.mockImplementation(async (id: string) => { if (id === 'b') throw new Error('nope') })
    render(<QueueDrawer open onToggle={() => {}} />)
    fireEvent.click(screen.getByText('Select'))
    fireEvent.click(screen.getByText('task a'))
    fireEvent.click(screen.getByText('task b'))
    fireEvent.click(screen.getByText('✓ Done'))
    await waitFor(() => expect(screen.getByText('1 selected')).toBeTruthy())
  })
})
