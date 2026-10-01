import { useState, useEffect, useCallback } from 'react'

export function usePersistentState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setInternalState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setState = useCallback((val: T | ((prev: T) => T)) => {
    setInternalState((prev) => {
      const next = typeof val === 'function' ? (val as (p: T) => T)(prev) : val
      try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* quota exceeded */ }
      return next
    })
  }, [key])

  // Sync across tabs
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === key && e.newValue !== null) {
        try { setInternalState(JSON.parse(e.newValue) as T) } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  return [state, setState]
}
