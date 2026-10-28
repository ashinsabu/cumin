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
  const userIdRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (userIdRef.current !== user?.id) queryClient.clear()
    userIdRef.current = user?.id
  }, [user?.id, queryClient])

  // Boot: the refresh cookie (if any) is exchanged for an access token and the user in one call.
  useEffect(() => {
    refreshSessionWithRetry()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    onSessionLost(() => setUser(null))
    return () => onSessionLost(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setUser(await loginWithPassword(email, password))
  }, [])

  const logout = useCallback(() => {
    void endSession().finally(() => setUser(null))
  }, [])

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
