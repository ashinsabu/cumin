import type { Preset } from './types'

export const PRESETS: Record<Preset['id'], Preset> = {
  cyber: {
    id: 'cyber', name: 'Cyber',
    fonts: { body: "'Geist', system-ui, sans-serif", mono: "'Geist Mono', ui-monospace, monospace" },
    radius: { chrome: '0px', card: '4px', badge: '2px' },
    shadows: { card: 'none', modal: '0 0 0 1px var(--c-line)', focusGlow: '0 0 0 2px var(--c-accent)' },
    surfaces: { blur: false, blurAmount: '0px', panelGradient: null },
    colors: {
      dark: {
        canvas: '#09090b', surface: '#111113', raised: '#161618', panel: '#0c0c0e',
        line: '#1e1e24', ink: '#fafafa', dim: '#71717a', ghost: '#3f3f46',
        accent: '#e11d48', accentFg: '#ffffff',
      },
      light: {
        canvas: '#f5f4f2', surface: '#ffffff', raised: '#ffffff', panel: '#f0eeec',
        line: '#e2e0de', ink: '#0c0c0e', dim: '#6b7280', ghost: '#a1a1aa',
        accent: '#e11d48', accentFg: '#ffffff',
      },
    },
  },
  glass: {
    id: 'glass', name: 'Glass',
    fonts: { body: "'Geist', system-ui, sans-serif", mono: "'Geist Mono', ui-monospace, monospace" },
    radius: { chrome: '4px', card: '8px', badge: '4px' },
    shadows: {
      card: '0 1px 3px rgba(0,0,0,0.3)',
      modal: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
      focusGlow: '0 0 0 2px var(--c-accent)',
    },
    surfaces: { blur: true, blurAmount: '12px', panelGradient: 'linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)' },
    colors: {
      dark: {
        canvas: '#0d0d14', surface: 'rgba(255,255,255,0.05)', raised: 'rgba(255,255,255,0.08)', panel: 'rgba(255,255,255,0.03)',
        line: 'rgba(255,255,255,0.08)', ink: '#f1f0ff', dim: '#8b8ba7', ghost: '#4a4a5a',
        accent: '#7c3aed', accentFg: '#ffffff',
      },
      light: {
        canvas: '#ebebf5', surface: 'rgba(255,255,255,0.75)', raised: 'rgba(255,255,255,0.92)', panel: 'rgba(255,255,255,0.55)',
        line: 'rgba(0,0,0,0.08)', ink: '#0f0e1a', dim: '#6b6b80', ghost: '#a0a0b0',
        accent: '#7c3aed', accentFg: '#ffffff',
      },
    },
  },
  minimal: {
    id: 'minimal', name: 'Minimal',
    fonts: { body: 'system-ui, -apple-system, sans-serif', mono: 'ui-monospace, monospace' },
    radius: { chrome: '4px', card: '6px', badge: '4px' },
    shadows: { card: 'none', modal: '0 2px 12px rgba(0,0,0,0.12)', focusGlow: '0 0 0 2px var(--c-accent)' },
    surfaces: { blur: false, blurAmount: '0px', panelGradient: null },
    colors: {
      dark: {
        canvas: '#1c1c1e', surface: '#2c2c2e', raised: '#3a3a3c', panel: '#1c1c1e',
        line: '#38383a', ink: '#f5f5f7', dim: '#8e8e93', ghost: '#48484a',
        accent: '#3b82f6', accentFg: '#ffffff',
      },
      light: {
        canvas: '#f5f5f7', surface: '#ffffff', raised: '#ffffff', panel: '#fafafa',
        line: '#e5e5ea', ink: '#1c1c1e', dim: '#6c6c70', ghost: '#aeaeb2',
        accent: '#3b82f6', accentFg: '#ffffff',
      },
    },
  },
}

export const DEFAULT_PREFS = { preset: 'cyber' as const, mode: 'dark' as const }
