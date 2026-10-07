import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''
const CACHE_KEY = 'ff_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

type Flags = Record<string, boolean>
type FlagsContextValue = { flags: Flags; isEnabled: (flag: string) => boolean }

const FlagsContext = createContext<FlagsContextValue>({ flags: {}, isEnabled: () => false })

function readCache(): { flags: Flags; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(flags: Flags) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), flags }))
  } catch {}
}

export function FlagsProvider({ children }: { children: ReactNode }) {
  const cached = readCache()
  const [flags, setFlags] = useState<Flags>(cached?.flags ?? {})

  useEffect(() => {
    // Only skip fetch if cache is fresh AND has at least one flag
    const c = readCache()
    if (c && Object.keys(c.flags).length > 0) return
    fetch(`${API}/api/flags`)
      .then(async (r) => {
        if (!r.ok) return null
        return r.json() as Promise<Flags>
      })
      .then((data) => {
        if (!data) return
        writeCache(data)
        setFlags(data)
      })
      .catch(() => {})
  }, [])

  return (
    <FlagsContext.Provider value={{ flags, isEnabled: (f) => !!flags[f] }}>
      {children}
    </FlagsContext.Provider>
  )
}

export function useFlags() {
  return useContext(FlagsContext)
}
