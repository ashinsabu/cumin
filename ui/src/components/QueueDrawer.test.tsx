import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateItem = vi.fn(async () => {})
vi.mock('../context/QueueContext', () => ({ useQueue: () => ({ updateItem, promoteItem: vi.fn() }) }))
vi.mock('../hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))
vi.mock('../hooks/useBoardQueries', () => ({ useBoardStatuses: () => ({ data: [] }) }))
vi.mock('../hooks/useEpics', () => ({ useEpics: () => ({ data: [] }) }))
vi.mock('../hooks/useSprints', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('../lib/auth', () => ({ authFetch: vi.fn() }))

import { ExpandedEditor, parseDueIn, deadlineToDueIn, MAX_DUE_HOURS } from './QueueDrawer'

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

// Quick tasks are due today by definition: "Due in" is hours, capped at 12h; longer input is clamped
// (with a hint to send it to the board) instead of becoming a multi-day deadline / inflating urgency.
describe('due-in', () => {
  const hoursFromNow = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 3600000)
  it('accepts hours and minutes as-is', () => {
    expect(hoursFromNow(parseDueIn('2h').iso)).toBe(2)
    expect(parseDueIn('2h').clamped).toBe(false)
    expect(parseDueIn('90m').clamped).toBe(false)
  })
  it('clamps anything over 12h (including days/weeks) to 12h and flags it', () => {
    for (const input of ['13h', '2d', '1w']) {
      const r = parseDueIn(input)
      expect(r.clamped).toBe(true)
      expect(hoursFromNow(r.iso)).toBe(MAX_DUE_HOURS)
    }
  })
  it('prefills the field from a saved deadline', () => {
    expect(deadlineToDueIn(new Date(Date.now() + 5 * 3600000).toISOString())).toBe('5h')
    render(<ExpandedEditor item={{ id: 'q2', title: 'T', notes: '', priority: 2, estimate_minutes: null, deadline: new Date(Date.now() + 3 * 3600000).toISOString() } as never} />)
    expect((screen.getByPlaceholderText('2h, 90m') as HTMLInputElement).value).toBe('3h')
  })
  it('typing more than 12h snaps the field to 12h and shows the send-to-board hint', () => {
    render(<ExpandedEditor item={item} />)
    const input = screen.getByPlaceholderText('2h, 90m') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2d' } })
    fireEvent.blur(input)
    expect(input.value).toBe('12h')
    expect(screen.getByText('Send to board')).toBeTruthy()
  })
})
