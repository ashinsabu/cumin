import { useState, useEffect, useRef } from 'react'
import type { Item } from '../../types'
import { PRIORITY } from '../../constants'
import { useBoard } from '../../context/BoardContext'

interface Props {
  item: Item
  editable?: boolean
}

export function ItemPriorityBadge({ item, editable = true }: Props) {
  const { updateItem } = useBoard()
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
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-raised border border-line rounded-lg shadow-xl py-1 min-w-[90px]">
          {Object.entries(PRIORITY).map(([val, cfg]) => (
            <button
              key={val}
              type="button"
              onClick={() => { updateItem(item.id, { priority: Number(val) }); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors hover:bg-surface ${
                item.priority === Number(val) ? 'opacity-100' : 'opacity-70'
              }`}
              style={{ color: cfg.color }}
            >
              {cfg.label}
              {item.priority === Number(val) && <span className="ml-1.5 text-ghost text-[10px] font-normal">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
