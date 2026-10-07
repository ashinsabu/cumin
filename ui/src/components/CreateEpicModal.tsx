import { useState } from 'react'
import { motion } from 'framer-motion'
import { useCreateEpic } from '../hooks/useEpics'
import type { CreateEpicPayload } from '../context/BoardContext'
import { fade, modalScale } from '../lib/motionVariants'

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#e11d48',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#06b6d4', '#6b7280', '#a16207',
]

const TYPE_OPTIONS: { value: CreateEpicPayload['type']; label: string }[] = [
  { value: 'goal', label: 'Goal' },
  { value: 'recurring', label: 'Recurring' },
  { value: 'catchall', label: 'Catch-all' },
]

export function CreateEpicModal({ onClose }: { onClose: () => void }) {
  const createEpicMutation = useCreateEpic()
  const [name, setName] = useState('')
  const [type, setType] = useState<CreateEpicPayload['type']>('goal')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError('')
    try {
      await createEpicMutation.mutateAsync({
        name: name.trim(),
        type,
        color,
        description: description.trim() || undefined,
        deadline: deadline ? `${deadline}T00:00:00Z` : null,
      })
      onClose()
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div variants={fade} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.15 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        variants={modalScale}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="relative w-full max-w-md rounded-[var(--c-radius-card)] shadow-xl bg-raised border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-sm font-semibold text-ink">New Epic</h2>
          <button onClick={onClose} className="text-ghost hover:text-ink transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-dim">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Epic name"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ghost focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-dim">Type</label>
              <div className="flex gap-1.5">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-lg border transition-colors ${
                      type === t.value
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-line text-dim hover:border-accent/50'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-dim">Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c, outline: color === c ? `3px solid ${c}` : undefined, outlineOffset: '2px' }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-dim">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={2}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ghost focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-dim">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-line text-dim hover:text-ink hover:border-accent/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Epic'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
