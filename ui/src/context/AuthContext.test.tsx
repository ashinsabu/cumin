import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

let sessionLost: (() => void) | null = null
vi.mock('../lib/auth', () => ({
  refreshSession: vi.fn(),
  loginWithPassword: vi.fn(),
  logout: vi.fn(async () => {}),
  onSessionLost: (cb: (() => void) | null) => { sessionLost = cb },
}))

import { refreshSession } from '../lib/auth'
import { AuthProvider, useAuth } from './AuthContext'

const userA = { id: 'a', email: 'a@x.co', display_name: 'A', avatar_url: '', id_prefix: 'A' }

function Probe() {
  const { user, loading } = useAuth()
  return <div>{loading ? 'loading' : (user?.id ?? 'signed-out')}</div>
}

describe('AuthProvider', () => {
  beforeEach(() => { sessionLost = null })

  // Query keys are not user-scoped; without this, the next account on the same tab would see
  // the previous account's cached items/sprints/epics.
  it('clears the query cache when the session is lost', async () => {
    vi.mocked(refreshSession).mockResolvedValue(userA)
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('a')
    queryClient.setQueryData(['items'], [{ id: 'secret' }])

    act(() => sessionLost?.())

    await screen.findByText('signed-out')
    await waitFor(() => expect(queryClient.getQueryData(['items'])).toBeUndefined())
  })

  // A 5xx/network blip at boot used to render the login page for a user with a valid cookie.
  it('retries a transient boot failure instead of showing signed-out', async () => {
    vi.mocked(refreshSession).mockReset()
    vi.mocked(refreshSession).mockRejectedValueOnce(new Error('503')).mockResolvedValue(userA)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider><Probe /></AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('a', {}, { timeout: 3000 })
    expect(refreshSession).toHaveBeenCalledTimes(2)
  })
})
