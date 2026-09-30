export type ColorScale = {
  canvas: string; surface: string; raised: string; panel: string
  line: string; ink: string; dim: string; ghost: string
  accent: string; accentFg: string
}

export type Preset = {
  id: 'cyber' | 'glass' | 'minimal'
  name: string
  fonts: { body: string; mono: string }
  radius: { chrome: string; card: string; badge: string }
  shadows: { card: string; modal: string; focusGlow: string }
  surfaces: { blur: boolean; blurAmount: string; panelGradient: string | null }
  colors: { dark: ColorScale; light: ColorScale }
}

export type ThemePrefs = { preset: Preset['id']; mode: 'dark' | 'light' }
