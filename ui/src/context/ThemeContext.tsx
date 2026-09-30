import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { PRESETS, DEFAULT_PREFS } from '../themes/index'
import type { ThemePrefs, Preset } from '../themes/types'

type ThemeContextValue = {
  prefs: ThemePrefs
  setPrefs: (prefs: ThemePrefs) => void
  isDark: boolean
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
  isDark: true,
  toggle: () => {},
})

function applyPreset(preset: Preset, mode: 'dark' | 'light') {
  const c = preset.colors[mode]
  const root = document.documentElement
  root.style.setProperty('--c-canvas',     c.canvas)
  root.style.setProperty('--c-surface',    c.surface)
  root.style.setProperty('--c-raised',     c.raised)
  root.style.setProperty('--c-panel',      c.panel)
  root.style.setProperty('--c-line',       c.line)
  root.style.setProperty('--c-ink',        c.ink)
  root.style.setProperty('--c-dim',        c.dim)
  root.style.setProperty('--c-ghost',      c.ghost)
  root.style.setProperty('--c-accent',     c.accent)
  root.style.setProperty('--c-accent-fg',  c.accentFg)
  root.style.setProperty('--c-radius-chrome', preset.radius.chrome)
  root.style.setProperty('--c-radius-card',   preset.radius.card)
  root.style.setProperty('--c-radius-badge',  preset.radius.badge)
  root.style.setProperty('--c-shadow-card',   preset.shadows.card)
  root.style.setProperty('--c-shadow-modal',  preset.shadows.modal)
  root.style.setProperty('--c-shadow-glow',   preset.shadows.focusGlow)
  root.style.setProperty('--c-blur',      preset.surfaces.blur ? `blur(${preset.surfaces.blurAmount})` : 'none')
  root.style.setProperty('--c-panel-bg',  preset.surfaces.panelGradient ?? 'none')
  root.style.setProperty('--c-font-body', preset.fonts.body)
  root.style.setProperty('--c-font-mono', preset.fonts.mono)
  root.classList.toggle('dark', mode === 'dark')
  root.dataset.preset = preset.id
}

function loadFromStorage(): ThemePrefs {
  try {
    const stored = localStorage.getItem('cumin-theme')
    if (stored) return JSON.parse(stored)
  } catch {}
  return DEFAULT_PREFS
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<ThemePrefs>(() => {
    const p = loadFromStorage()
    applyPreset(PRESETS[p.preset], p.mode)
    return p
  })

  const setPrefs = (next: ThemePrefs) => {
    applyPreset(PRESETS[next.preset], next.mode)
    localStorage.setItem('cumin-theme', JSON.stringify(next))
    setPrefsState(next)
  }

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('cumin-theme')
      if (!stored) {
        const next = { ...DEFAULT_PREFS, mode: e.matches ? 'dark' as const : 'light' as const }
        applyPreset(PRESETS[next.preset], next.mode)
        setPrefsState(next)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggle = () => setPrefs({ ...prefs, mode: prefs.mode === 'dark' ? 'light' : 'dark' })

  return (
    <ThemeContext.Provider value={{ prefs, setPrefs, isDark: prefs.mode === 'dark', toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
