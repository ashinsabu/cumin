import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { refreshSession, loginWithPassword, logout as endSession, onSessionLost, type SessionUser } from '../lib/auth'

type AuthContextValue = {
  user: SessionUser | null
  loading: boolean
  /** Email+password sign-in; rejects with AuthRequestError (e.g. message `email_not_verified`). */
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Boot: the refresh cookie (if any) is exchanged for an access token and the user in one call.
  useEffect(() => {
    refreshSession()
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
