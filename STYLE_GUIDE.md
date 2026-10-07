# Cumin — Design System & Style Guide

For the iOS app (or any client) — match these tokens exactly for visual consistency.

---

## Themes

Cumin has three theme presets, each with a dark and light mode.  
Default: **Cyber Dark**.

### Cyber (default — terminal aesthetic)
Sharp edges, monospace font, accent glow.

| Token     | Dark          | Light         |
|-----------|---------------|---------------|
| canvas    | `#09090b`     | `#f5f4f2`     |
| surface   | `#111113`     | `#ffffff`     |
| raised    | `#161618`     | `#ffffff`     |
| panel     | `#0c0c0e`     | `#f0eeec`     |
| line      | `#1e1e24`     | `#e2e0de`     |
| ink       | `#fafafa`     | `#0c0c0e`     |
| dim       | `#a1a1aa`     | `#6b7280`     |
| ghost     | `#71717a`     | `#a1a1aa`     |
| accent    | `#e11d48`     | `#e11d48`     |
| accent-fg | `#ffffff`     | `#ffffff`     |

Radius: 0px everywhere (sharp). Font: Geist Mono for both body and mono.

---

### Glass (frosted surfaces)
Rounded, blurred backgrounds, purple accent.

| Token     | Dark                        | Light                        |
|-----------|-----------------------------|------------------------------|
| canvas    | `#0d0d14`                   | `#ebebf5`                    |
| surface   | `rgba(255,255,255,0.05)`    | `rgba(255,255,255,0.75)`     |
| raised    | `rgba(255,255,255,0.08)`    | `rgba(255,255,255,0.92)`     |
| panel     | `rgba(255,255,255,0.03)`    | `rgba(255,255,255,0.55)`     |
| line      | `rgba(255,255,255,0.08)`    | `rgba(0,0,0,0.08)`           |
| ink       | `#f1f0ff`                   | `#0f0e1a`                    |
| dim       | `#8b8ba7`                   | `#6b6b80`                    |
| ghost     | `#4a4a5a`                   | `#a0a0b0`                    |
| accent    | `#7c3aed`                   | `#7c3aed`                    |
| accent-fg | `#ffffff`                   | `#ffffff`                    |

Radius: chrome 4px, card 8px, badge 4px. Backdrop blur: 12px on panels.

---

### Minimal (system UI)
Clean, no decoration, blue accent.

| Token     | Dark       | Light      |
|-----------|------------|------------|
| canvas    | `#1c1c1e`  | `#f5f5f7`  |
| surface   | `#2c2c2e`  | `#ffffff`  |
| raised    | `#3a3a3c`  | `#ffffff`  |
| panel     | `#1c1c1e`  | `#fafafa`  |
| line      | `#38383a`  | `#e5e5ea`  |
| ink       | `#f5f5f7`  | `#1c1c1e`  |
| dim       | `#8e8e93`  | `#6c6c70`  |
| ghost     | `#48484a`  | `#aeaeb2`  |
| accent    | `#3b82f6`  | `#3b82f6`  |
| accent-fg | `#ffffff`  | `#ffffff`  |

Radius: chrome 4px, card 6px, badge 4px. No blur.

---

## Token Semantics

| Token     | Use for                                                   |
|-----------|-----------------------------------------------------------|
| `canvas`  | App background — the outermost layer                      |
| `surface` | Cards, main content panels, list rows                     |
| `raised`  | Modals, dropdowns, popovers — one layer above surface     |
| `panel`   | Sidebar, navigation rail                                  |
| `line`    | All borders, dividers, separators                         |
| `ink`     | Primary text                                              |
| `dim`     | Secondary text, labels, metadata                          |
| `ghost`   | Placeholder text, muted hints, disabled states            |
| `accent`  | Brand color — CTAs, active state, badges, highlights      |
| `accent-fg` | Text/icon on accent background (always white)           |

**Never hardcode hex in components.** Always reference the token. This ensures theme switching works automatically.

---

## Typography

| Preset  | Body font                                      | Mono font                          |
|---------|------------------------------------------------|------------------------------------|
| Cyber   | Geist Mono (monospace for everything)          | Geist Mono                         |
| Glass   | Geist (humanist sans-serif)                    | Geist Mono                         |
| Minimal | system-ui / -apple-system (native system font) | ui-monospace                       |

Base size: **14px**, line-height: **1.5**.  
Anti-aliasing: `-webkit-font-smoothing: antialiased`.

For iOS: use SF Pro (system font) for Minimal, and map Geist → SF Pro for Cyber/Glass — they share similar proportions.

---

## Spacing & Radius (per preset)

| Preset  | Chrome radius | Card radius | Badge radius |
|---------|---------------|-------------|--------------|
| Cyber   | 0px           | 0px         | 0px          |
| Glass   | 4px           | 8px         | 4px          |
| Minimal | 4px           | 6px         | 4px          |

- **Chrome**: navigation, sidebar, app shell elements
- **Card**: item cards, modals, dropdowns, panels
- **Badge**: priority chips, status pills, tags

---

## Priority Colors

Priority uses the accent system with opacity modifiers, not separate colors.

| Level | Label | Color treatment              |
|-------|-------|------------------------------|
| P0    | Critical | `accent` full opacity — `bg-accent text-accent-fg` |
| P1    | High  | `accent/80`                  |
| P2    | Medium | `accent/60`                 |
| P3    | Low   | `accent/40`                  |
| P4    | Minimal | `accent/20`                |

---

## Status Colors

Status badges use semantic colors (not accent):
- `DONE`: `bg-emerald-500/10 text-emerald-400`
- `IN PROGRESS`: `bg-blue-500/10 text-blue-400`
- `BLOCKED`: `bg-red-500/10 text-red-400`
- `TODO` / initial: `bg-zinc-500/10 text-zinc-400`

---

## Shadows

| Preset  | Modal / Dropdown                                              |
|---------|---------------------------------------------------------------|
| Cyber   | `0 0 0 1px accent` (glow ring, no blur)                      |
| Glass   | `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)` |
| Minimal | `0 2px 12px rgba(0,0,0,0.12)`                                |

---

## Key UI Patterns

**Item card**: `bg-surface border border-line rounded-[card-radius] p-2.5`  
**Modal**: `bg-raised border border-line rounded-[card-radius] shadow-modal`  
**Sidebar**: `bg-panel border-r border-line`  
**Active nav item (Cyber)**: left border `2px solid accent` + `bg-accent/8`  
**Button primary**: `bg-accent text-accent-fg hover:bg-accent/80`  
**Button secondary**: `border border-line text-dim hover:bg-surface`  
**Badge / chip**: `bg-accent/10 text-accent text-xs font-medium px-1.5 py-0.5 rounded-[badge-radius]`

---

## Accent Usage Rules

- `bg-accent` — filled button, active indicator
- `bg-accent/10` — subtle highlight (active filter, hover background)
- `text-accent` — link, active label, emphasis
- `border-accent` — active/selected border
- Never combine `bg-accent` and `border-accent` — redundant

---

## Animation

Spring config used throughout: `{ type: 'spring', damping: 28, stiffness: 380, mass: 0.8 }`  
Toast entry: `translateX(40px) scale(0.96) → identity`, duration 180ms, `cubic-bezier(0.16,1,0.3,1)`  
Popover entry: scale + opacity from origin top-left, ~150ms.

For iOS: use spring with damping ~0.75, response ~0.3s as equivalent.
