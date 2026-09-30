import { useState, useEffect, useRef } from 'react'
import { useBoard } from '../context/BoardContext'
import { FilterSelect } from './FilterSelect'

type Props = {
  onClose: () => void
  onCreated?: (itemId: string) => void
}

export function CreateItemModal({ onClose, onCreated }: Props) {
  const { projects, epics, createItem } = useBoard()
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [epicId, setEpicId] = useState('')
  const [priority, setPriority] = useState(3)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    if (projects.length > 0 && !projectId) setProjectId(projects[0].id)
  }, [projects])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!projectId) { setError('Select a project'); return }

    setSubmitting(true)
    setError('')
    try {
      const item = await createItem({
        title: title.trim(),
        project_id: projectId,
        epic_id: epicId || null,
        priority,
      })
      onCreated?.(item.display_id)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create item')
    } finally {
      setSubmitting(false)
    }
  }

  const priorities = [
    { value: 0, label: 'P0', color: '#ef4444' },
    { value: 1, label: 'P1', color: '#f97316' },
    { value: 2, label: 'P2', color: '#eab308' },
    { value: 3, label: 'P3', color: '#22c55e' },
    { value: 4, label: 'P4', color: '#6b7280' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="raised-surface relative z-10 w-full max-w-md rounded-[var(--c-radius-card)] border bg-raised border-line shadow-[var(--c-shadow-modal)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="text-sm font-semibold text-ink">New item</span>
          <button onClick={onClose} className="text-dim hover:text-ink p-1">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item title"
              className="w-full px-3 py-2 text-sm rounded-[var(--c-radius-card)] border bg-surface border-line text-ink placeholder:text-ghost focus:outline-none focus:border-ghost"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-dim">Project</label>
            <FilterSelect
              fullWidth
              value={projectId}
              onChange={setProjectId}
              options={projects.map((p) => ({ value: p.id, label: `${p.name} (${p.prefix})` }))}
            />
          </div>

          {epics.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-dim">Epic <span className="text-ghost font-normal">(optional)</span></label>
              <FilterSelect
                fullWidth
                value={epicId || '__none__'}
                onChange={(v) => setEpicId(v === '__none__' ? '' : v)}
                options={[
                  { value: '__none__', label: 'None' },
                  ...epics.map((e) => ({ value: e.id, label: e.name })),
                ]}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-dim">Priority</label>
            <div className="flex gap-1.5">
              {priorities.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-[var(--c-radius-badge)] border transition-colors ${
                    priority === p.value
                      ? 'border-current bg-current/10'
                      : 'border-line text-dim hover:border-ghost'
                  }`}
                  style={priority === p.value ? { color: p.color } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-[var(--c-radius-card)] text-dim hover:text-ink hover:bg-line"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="px-4 py-1.5 text-sm font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? 'Creating…' : 'Create item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
