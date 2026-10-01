import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''

type AuthUser = {
  id: string
  email: string
  display_name: string
  avatar_url: string
  id_prefix: string
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json()
        return null
      })
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = () => {
    fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' })
      .then(() => setUser(null))
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
