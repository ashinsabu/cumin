import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const authFetch = vi.fn()
vi.mock('../lib/auth', () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }))

import { RecentlyDeletedSection } from './AccountView'

const json = (body: unknown) => ({ ok: true, json: async () => body })

function renderTrash() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RecentlyDeletedSection />
    </QueryClientProvider>,
  )
}

// Regression (user feedback 2026-10-28): a deleted item was nowhere to be found — Trash only knew
// projects and epics and showed "Nothing in trash." with a deleted item sitting in the database.
describe('Trash: deleted items', () => {
  beforeEach(() => { authFetch.mockReset() })

  it('lists a deleted item instead of claiming trash is empty, and restores it via the item endpoint', async () => {
    authFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/trash') {
        return json({ projects: [], epics: [], items: [{ id: 'i1', display_id: 'ASH-7', title: 'Fix login', project_name: 'ashin sabu', deleted_at: new Date().toISOString() }] })
      }
      if (path === '/api/items/i1/restore' && init?.method === 'POST') return json({})
      throw new Error(`unexpected ${String(path)} ${JSON.stringify(init)}`)
    })

    renderTrash()
    await screen.findByText('Fix login')
    expect(screen.queryByText('Nothing in trash.')).toBeNull()

    fireEvent.click(screen.getByText('Restore'))
    await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/items/i1/restore', { method: 'POST' }))
  })
})
