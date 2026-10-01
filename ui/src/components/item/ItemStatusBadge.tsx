import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Item } from '../../types'
import { useBoard } from '../../context/BoardContext'
import { popover } from '../../lib/motionVariants'

interface Props {
  item: Item
  editable?: boolean
}

export function ItemStatusBadge({ item, editable = true }: Props) {
  const { statuses, moveItem } = useBoard()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const s = statuses.find((st) => st.id === item.status_id)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const badge = (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors select-none ${
      s?.is_done ? 'bg-emerald-500/10 text-emerald-400' : 'bg-line text-dim'
    } ${editable ? 'cursor-pointer hover:opacity-80' : ''}`}>
      {s?.name ?? '—'}
    </span>
  )

  if (!editable) return badge

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <div onClick={() => setOpen((v) => !v)}>{badge}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            variants={popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 top-full mt-1 z-20 bg-raised border border-line rounded-lg shadow-xl py-1 min-w-[140px]"
          >
            {statuses.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => { moveItem(item.id, st.id); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-surface ${
                  st.id === item.status_id ? 'text-accent' : 'text-ink'
                }`}
              >
                {st.name}
                {st.id === item.status_id && <span className="ml-1.5 text-ghost text-[10px]">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
