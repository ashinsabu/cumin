import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { popover } from '../lib/motionVariants'

export type FilterOption = {
  value: string
  label: string
  color?: string  // hex dot indicator; omit for "all/reset" row
}

type Props = {
  value: string
  onChange: (value: string) => void
  options: FilterOption[]
  placeholder?: string
  fullWidth?: boolean
}

export function FilterSelect({ value, onChange, options, placeholder, fullWidth }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const isFiltered = value !== options[0]?.value

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={`relative${fullWidth ? ' w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--c-radius-card)] border text-xs font-medium transition-colors outline-none${fullWidth ? ' w-full justify-between' : ''} ${
          isFiltered
            ? 'border-accent text-accent bg-accent/10'
            : 'border-line text-dim bg-surface hover:border-ghost hover:text-ink'
        }`}
      >
        {selected?.color && isFiltered && (
          <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ backgroundColor: selected.color }} />
        )}
        {selected?.label ?? placeholder}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ originX: 0, originY: 0 }}
            className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-[var(--c-radius-card)] border bg-raised border-line shadow-[var(--c-shadow-modal)] overflow-hidden"
          >
            {options.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                  opt.value === value
                    ? 'text-accent bg-accent/10'
                    : 'text-ink hover:bg-surface'
                }`}
              >
                {opt.color ? (
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                ) : (
                  <span className="w-2 h-2 shrink-0" />
                )}
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
