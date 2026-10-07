import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from 'react'

export type ToastOptions = {
  message: string
  undo?: () => void | Promise<void>
  onCommit?: () => Promise<void>
  onCommitError?: () => void
  duration?: number
}

export type ToastEntry = ToastOptions & {
  id: string
  expiresAt: number
  duration: number
}

type ToastContextValue = {
  push: (opts: ToastOptions) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const MAX_TOASTS = 3
let _counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const commit = useCallback((entry: ToastEntry) => {
    entry.onCommit?.().catch(() => {
      entry.onCommitError?.()
    })
    setToasts(prev => prev.filter(t => t.id !== entry.id))
    timersRef.current.delete(entry.id)
  }, [])

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const undo = useCallback((entry: ToastEntry) => {
    const timer = timersRef.current.get(entry.id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(entry.id)
    }
    entry.undo?.()
    setToasts(prev => prev.filter(t => t.id !== entry.id))
  }, [])

  const push = useCallback((opts: ToastOptions) => {
    const duration = opts.duration ?? 5000
    const id = `toast-${++_counter}`
    const entry: ToastEntry = { ...opts, id, duration, expiresAt: Date.now() + duration }

    setToasts(prev => {
      if (prev.length >= MAX_TOASTS) {
        const oldest = prev[0]
        const oldTimer = timersRef.current.get(oldest.id)
        if (oldTimer) {
          clearTimeout(oldTimer)
          timersRef.current.delete(oldest.id)
        }
        oldest.onCommit?.().catch(() => oldest.onCommitError?.())
        return [...prev.slice(1), entry]
      }
      return [...prev, entry]
    })

    const timer = setTimeout(() => commit(entry), duration)
    timersRef.current.set(id, timer)
  }, [commit])

  useEffect(() => {
    const timers = timersRef.current
    return () => { timers.forEach(t => clearTimeout(t)) }
  }, [])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <ToastRenderer toasts={toasts} onUndo={undo} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastRenderer({
  toasts,
  onUndo,
  onDismiss,
}: {
  toasts: ToastEntry[]
  onUndo: (entry: ToastEntry) => void
  onDismiss: (entry: ToastEntry) => void
}) {
  return (
    <div className="fixed bottom-16 right-3 z-[60] flex flex-col-reverse gap-2 pointer-events-none md:bottom-4 md:right-4">
      {toasts.map(t => (
        <ToastItem key={t.id} entry={t} onUndo={onUndo} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({
  entry,
  onUndo,
  onDismiss,
}: {
  entry: ToastEntry
  onUndo: (e: ToastEntry) => void
  onDismiss: (e: ToastEntry) => void
}) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const raf = requestAnimationFrame(() => {
      bar.style.width = '0%'
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      className="pointer-events-auto relative overflow-hidden bg-raised border border-line rounded-[var(--c-radius-card)] shadow-modal px-3 py-2.5 flex items-center gap-3 min-w-[240px] max-w-[320px]"
      style={{ animation: 'toast-in 0.18s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      <span className="flex-1 text-sm text-ink leading-snug">{entry.message}</span>
      <div className="flex items-center gap-1 shrink-0">
        {entry.undo && (
          <button
            onClick={() => onUndo(entry)}
            className="text-xs font-medium text-accent hover:text-accent/80 px-2 py-0.5 rounded hover:bg-accent/10"
          >
            Undo
          </button>
        )}
        <button
          onClick={() => onDismiss(entry)}
          className="text-xs text-ghost hover:text-dim px-1"
        >
          ×
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-line">
        <div
          ref={barRef}
          className="h-full bg-accent/50"
          style={{ width: '100%', transition: `width ${entry.duration}ms linear` }}
        />
      </div>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
