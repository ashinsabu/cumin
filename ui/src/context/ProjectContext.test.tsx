import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../lib/auth', () => ({
  refreshSession: vi.fn(),
  loginWithPassword: vi.fn(),
  logout: vi.fn(async () => {}),
  onSessionLost: () => {},
}))
vi.mock('../lib/api', () => ({ apiFetch: vi.fn() }))

import { refreshSession } from '../lib/auth'
import { apiFetch } from '../lib/api'
import { AuthProvider } from './AuthContext'
import { ProjectProvider, useSelectedProject } from './ProjectContext'

const user = { id: 'u1', email: 'u@x.co', display_name: 'U', avatar_url: '', id_prefix: 'U' }

function Header() {
  const [project] = useSelectedProject()
  return <div data-testid="header">{project?.name ?? '…'}</div>
}

// Regression for B-01 (prod "PROJECT …"): ProjectProvider mounts above the auth gate, so its
// projects query fires at boot before the access token exists and fails. When the user then
// resolves, AuthProvider clears the cache; the provider's observer must recover and show the project.
describe('ProjectProvider across sign-in', () => {
  it('shows the project name after a boot-time projects failure and the identity cache clear', async () => {
    let signedIn = false
    vi.mocked(refreshSession).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20))
      signedIn = true
      return user
    })
    vi.mocked(apiFetch).mockImplementation(async () => {
      if (!signedIn) throw new Error('401 /api/projects')
      return { projects: [{ id: 'p1', name: 'House Move', color: '' }] } as never
    })

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider>
          <ProjectProvider><Header /></ProjectProvider>
        </AuthProvider>
      </QueryClientProvider>,
    )

    expect((await screen.findByTestId('header', {}, { timeout: 2000 })).textContent).toBe('…')
    await expect(screen.findByText('House Move', {}, { timeout: 2000 })).resolves.toBeTruthy()
  })
})
