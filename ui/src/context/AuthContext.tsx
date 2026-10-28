import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshSession, loginWithPassword, logout as endSession, onSessionLost, type SessionUser } from '../lib/auth'

type AuthContextValue = {
  user: SessionUser | null
  loading: boolean
  /** Email+password sign-in; rejects with AuthRequestError (e.g. message `email_not_verified`). */
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

/** A server blip at boot must not look like a logout: retry transient failures before giving up. */
async function refreshSessionWithRetry(attempts = 3, delayMs = 800): Promise<SessionUser | null> {
  for (let i = 1; ; i++) {
    try {
      return await refreshSession()
    } catch (err) {
      if (i >= attempts) throw err
      await new Promise((r) => setTimeout(r, delayMs * i))
    }
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  // Query keys are not user-scoped, so cached data must never survive a change of identity
  // (logout, lost session, or a different account signing in on the same tab).
  // The clear must happen BEFORE the state change, not in an effect after it: observers mounted
  // above the auth gate (ProjectProvider) re-resolve their query on the next render, and clearing
  // after that render leaves them attached to a removed query that never refetches.
  const userIdRef = useRef<string | undefined>(undefined)
  const applyUser = useCallback((next: SessionUser | null) => {
    if (userIdRef.current !== next?.id) queryClient.clear()
    userIdRef.current = next?.id
    setUser(next)
  }, [queryClient])

  // Boot: the refresh cookie (if any) is exchanged for an access token and the user in one call.
  useEffect(() => {
    refreshSessionWithRetry()
      .then(applyUser)
      .catch(() => applyUser(null))
      .finally(() => setLoading(false))
    onSessionLost(() => applyUser(null))
    return () => onSessionLost(null)
  }, [applyUser])

  const login = useCallback(async (email: string, password: string) => {
    applyUser(await loginWithPassword(email, password))
  }, [applyUser])

  const logout = useCallback(() => {
    void endSession().finally(() => applyUser(null))
  }, [applyUser])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
