import { useState, useEffect, useRef } from 'react'
import { useBoard } from '../../context/BoardContext'

interface Props {
  epicId?: string | null
  projectId?: string
  sprintId?: string | null
  onDone: () => void
  placeholder?: string
}

export function QuickAddItem({ epicId, projectId, onDone, placeholder }: Props) {
  const { createItem, projects } = useBoard()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const resolvedProjectId = projectId ?? projects[0]?.id ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !resolvedProjectId) return
    setSaving(true)
    try {
      await createItem({
        title: title.trim(),
        project_id: resolvedProjectId,
        epic_id: epicId ?? null,
      })
      setTitle('')
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-4 py-2.5 border-b border-line bg-surface/50"
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        placeholder={placeholder ?? 'Item title… (Enter to add, Esc to cancel)'}
        disabled={saving}
        className="flex-1 text-sm text-ink bg-transparent focus:outline-none placeholder:text-ghost"
      />
      {title.trim() && (
        <button
          type="submit"
          disabled={saving}
          className="text-xs font-semibold text-accent hover:opacity-80 shrink-0 disabled:opacity-40"
        >
          {saving ? '…' : 'Add'}
        </button>
      )}
    </form>
  )
}
