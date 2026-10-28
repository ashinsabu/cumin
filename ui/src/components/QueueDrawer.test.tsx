import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateItem = vi.fn(async () => {})
vi.mock('../context/QueueContext', () => ({ useQueue: () => ({ updateItem, promoteItem: vi.fn() }) }))
vi.mock('../hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))
vi.mock('../hooks/useBoardQueries', () => ({ useBoardStatuses: () => ({ data: [] }) }))
vi.mock('../hooks/useEpics', () => ({ useEpics: () => ({ data: [] }) }))
vi.mock('../hooks/useSprints', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('../lib/auth', () => ({ authFetch: vi.fn() }))

import { ExpandedEditor, parseDueIn, deadlineToDueIn } from './QueueDrawer'

const item = { id: 'q1', title: 'Feat', notes: '', priority: 2, estimate_minutes: null, deadline: null } as never

beforeEach(() => { updateItem.mockClear() })

// Regression: changing priority in the queue editor never saved, because only title/notes saved on blur.
describe('queue ExpandedEditor', () => {
  it('saves a priority change without needing a title/notes blur', async () => {
    render(<ExpandedEditor item={item} />)
    fireEvent.click(screen.getByText('P0'))
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('q1', expect.objectContaining({ priority: 0 })), { timeout: 2000 })
  })
})

// Queue items are due today by default (24h auto-archive): hour-based "due in" is not a deadline,
// otherwise "2h" showed "due today" and inflated the urgent count.
describe('due-in', () => {
  it('ignores hours / sub-day input and accepts days, weeks, months', () => {
    expect(parseDueIn('2h')).toBe('')
    expect(parseDueIn('3d')).not.toBe('')
    expect(parseDueIn('1w')).not.toBe('')
    expect(parseDueIn('1m')).not.toBe('')
  })
  it('prefills the field from a saved deadline', () => {
    const in3d = new Date(Date.now() + 3 * 86400000).toISOString()
    expect(deadlineToDueIn(in3d)).toBe('3d')
    expect(deadlineToDueIn(new Date(Date.now() + 3600000).toISOString())).toBe('today')
    render(<ExpandedEditor item={{ id: 'q2', title: 'T', notes: '', priority: 2, estimate_minutes: null, deadline: in3d } as never} />)
    expect((screen.getByPlaceholderText('2d, 1w, 1m') as HTMLInputElement).value).toBe('3d')
  })
})
