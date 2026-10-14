import { useState, useRef, useEffect, type ReactNode } from 'react'
import type { Status } from '../types'

// ─── Constants ───────────────────────────────────────────────────────────────

export const PRESET_COLORS = ['#6b7280', '#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6']

// ─── Status utilities ────────────────────────────────────────────────────────

const STATUS_MIDDLE_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

export function statusDisplayColor(status: Pick<Status, 'is_initial' | 'is_done' | 'color'>, middleIndex = 0): string {
  if (status.color) return status.color
  if (status.is_initial) return '#71717a'
  if (status.is_done) return '#22c55e'
  return STATUS_MIDDLE_COLORS[middleIndex % STATUS_MIDDLE_COLORS.length]
}

export function StatusBadge({ status, middleIndex = 0, className }: { status: Status; middleIndex?: number; className?: string }) {
  const color = statusDisplayColor(status, middleIndex)
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-[var(--c-radius-card)] border ${className ?? ''}`}
      style={{ backgroundColor: color + '18', color, borderColor: color + '30' }}
    >
      {status.name}
    </span>
  )
}

// ─── Primitives ──────────────────────────────────────────────────────────────

export function ColorDot({ color, size = 'sm' }: { color: string; size?: 'xs' | 'sm' | 'md' }) {
  const s = size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  return <div className={`${s} rounded-full shrink-0`} style={{ backgroundColor: color }} />
}

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="ml-1 text-ghost/40">↕</span>
  return <span className="ml-1 text-accent">{dir === 'asc' ? '↑' : '↓'}</span>
}

// ─── Composites ──────────────────────────────────────────────────────────────

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full transition-transform focus:outline-none ${value === c ? 'scale-125 ring-2 ring-offset-2 ring-offset-raised' : 'hover:scale-110'}`}
          style={{ backgroundColor: c, ['--tw-ring-color' as string]: c }}
        />
      ))}
    </div>
  )
}

export function ViewModeToggle({ value, onChange }: { value: 'list' | 'grid'; onChange: (v: 'list' | 'grid') => void }) {
  return (
    <div className="flex rounded-[var(--c-radius-card)] border border-line overflow-hidden">
      <button onClick={() => onChange('list')} title="List view"
        className={`px-2 py-1.5 text-xs transition-colors ${value === 'list' ? 'bg-accent/10 text-accent' : 'text-dim hover:bg-surface'}`}>☰</button>
      <button onClick={() => onChange('grid')} title="Grid view"
        className={`px-2 py-1.5 text-xs border-l border-line transition-colors ${value === 'grid' ? 'bg-accent/10 text-accent' : 'text-dim hover:bg-surface'}`}>⊞</button>
    </div>
  )
}

export function PageToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`shrink-0 px-4 py-3 border-b flex items-center gap-3 border-line ${className ?? ''}`}>
      {children}
    </div>
  )
}

/** Custom dropdown — replaces all native <select> elements. Never use <select> in the app. */
export function Select({ value, onChange, options, placeholder, className, size = 'sm' }: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
  size?: 'xs' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onOutside); document.removeEventListener('keydown', onKey) }
  }, [open])

  const selected = options.find((o) => o.value === value)
  const textSize = size === 'xs' ? 'text-xs' : 'text-sm'

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 w-full ${textSize} px-2.5 py-1.5 bg-surface border border-line rounded-[var(--c-radius-card)] text-ink hover:bg-raised focus:outline-none focus:border-accent/60 transition-colors`}
      >
        <span className="flex-1 text-left truncate">{selected?.label ?? placeholder ?? '—'}</span>
        <svg width="8" height="5" viewBox="0 0 10 6" fill="none" className={`shrink-0 text-ghost/50 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-full bg-raised border border-line rounded-[var(--c-radius-card)] shadow-lg py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left ${textSize} px-2.5 py-1.5 hover:bg-surface transition-colors ${opt.value === value ? 'text-accent' : 'text-ink'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Modals ──────────────────────────────────────────────────────────────────

export function ModalBase({ onClose, maxWidth = 'max-w-md', children }: {
  onClose: () => void
  maxWidth?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className={`relative z-10 w-full ${maxWidth} rounded-[var(--c-radius-card)] border bg-raised border-line shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({ title, description, confirmLabel = 'Confirm', destructive = false, onConfirm, onCancel }: {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ModalBase onClose={onCancel} maxWidth="max-w-sm">
      <div className="p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {description && <p className="text-xs text-dim mt-1">{description}</p>}
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-[var(--c-radius-card)] text-dim hover:text-ink hover:bg-line">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-1.5 text-sm font-semibold rounded-[var(--c-radius-card)] text-white hover:opacity-90 ${destructive ? 'bg-red-500' : 'bg-accent'}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalBase>
  )
}
