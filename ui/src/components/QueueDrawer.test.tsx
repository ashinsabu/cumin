import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateItem = vi.fn(async () => {})
vi.mock('../context/QueueContext', () => ({ useQueue: () => ({ updateItem, promoteItem: vi.fn() }) }))
vi.mock('../hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))
vi.mock('../hooks/useBoardQueries', () => ({ useBoardStatuses: () => ({ data: [] }) }))
vi.mock('../hooks/useEpics', () => ({ useEpics: () => ({ data: [] }) }))
vi.mock('../hooks/useSprints', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('../lib/auth', () => ({ authFetch: vi.fn() }))

import { ExpandedEditor } from './QueueDrawer'

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
