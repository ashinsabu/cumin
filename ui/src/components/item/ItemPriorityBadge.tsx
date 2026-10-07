import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Item } from '../../types'
import { PRIORITY } from '../../constants'
import { useUpdateItem } from '../../hooks/useItems'
import { popover } from '../../lib/motionVariants'

interface Props {
  item: Item
  editable?: boolean
}

export function ItemPriorityBadge({ item, editable = true }: Props) {
  const updateItemMutation = useUpdateItem()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const p = PRIORITY[item.priority] ?? PRIORITY[4]

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const badge = (
    <span
      className={`text-xs font-bold px-1.5 py-0.5 rounded leading-none select-none ${editable ? 'cursor-pointer hover:opacity-80' : ''}`}
      style={{ backgroundColor: p.bg, color: p.color }}
    >
      {p.label}
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
            style={{ originX: 0, originY: 0 }}
            className="absolute left-0 top-full mt-1 z-20 bg-raised border border-line rounded-lg shadow-xl py-1 min-w-[90px]"
          >
            {Object.entries(PRIORITY).map(([val, cfg]) => (
              <button
                key={val}
                type="button"
                onClick={() => { updateItemMutation.mutate({ id: item.id, payload: { priority: Number(val) } }); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface ${
                  item.priority === Number(val) ? 'opacity-100' : 'opacity-70'
                }`}
                style={{ color: cfg.color }}
              >
                {cfg.label}
                {item.priority === Number(val) && <span className="ml-1.5 text-ghost text-[10px] font-normal">✓</span>}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
