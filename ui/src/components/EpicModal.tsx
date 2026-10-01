import { useState, useEffect } from 'react'
import type { Epic, Item, Status } from '../types'
import { useBoard } from '../context/BoardContext'
import { formatEstimate } from '../hooks/useFormat'
import { PRIORITY } from '../constants'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 min-h-[28px]">
      <span className="text-sm font-medium text-dim pt-0.5 shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

const TYPE_STYLES: Record<string, string> = {
  recurring: 'bg-green-500/10 text-green-400 border-green-500/20',
  goal:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  catchall:  'bg-line text-dim border-line',
}

export function EpicModal({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  const { items, statuses, deleteEpic, selectEpic, refresh } = useBoard()

  const [name, setName] = useState(epic.name)
  const [description, setDescription] = useState(epic.description ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const epicItems = items.filter((i) => i.epic_id === epic.id)
  const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
  const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)

  const isDirty = name !== epic.name || description !== (epic.description ?? '')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, showDeleteConfirm])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch(`/api/epics/${epic.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Save failed')
      }
      refresh()
      onClose()
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteEpic(epic.id)
      selectEpic(null)
      onClose()
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-[var(--c-radius-card)] shadow-xl overflow-hidden bg-raised border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${TYPE_STYLES[epic.type] ?? TYPE_STYLES.catchall}`}>
                {epic.type}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[var(--c-radius-card)] hover:bg-line text-dim transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full text-base font-semibold text-ink bg-transparent focus:outline-none placeholder:text-ghost"
            placeholder="Epic name"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description…"
            rows={2}
            className="w-full mt-2 text-sm text-dim bg-transparent focus:outline-none placeholder:text-ghost resize-none"
          />
        </div>

        {/* Stats */}
        <div className="px-6 py-3 border-b border-line space-y-3">
          <Row label="Items">
            <span className="text-sm font-medium text-ink">
              {doneItems.length}<span className="text-ghost">/{epicItems.length}</span>
            </span>
          </Row>
          <Row label="Estimate">
            <span className="text-sm font-medium text-ink">{totalEstimate ? formatEstimate(totalEstimate) : '—'}</span>
          </Row>
          {epic.deadline && (
            <Row label="Deadline">
              <span className="text-sm text-ink">{new Date(epic.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </Row>
          )}
        </div>

        {/* Items list */}
        {epicItems.length > 0 && (
          <div className="max-h-48 overflow-y-auto">
            {epicItems.map((item) => {
              const s = statuses.find((st) => st.id === item.status_id)
              const p = PRIORITY[item.priority] ?? PRIORITY[4]
              return (
                <div key={item.id} className="flex items-center gap-3 px-6 py-2 border-b border-line last:border-0 hover:bg-surface transition-colors">
                  <span className="text-xs font-mono text-accent shrink-0">{item.display_id}</span>
                  <span className="text-xs font-bold shrink-0" style={{ color: p.color }}>{p.label}</span>
                  <span className="text-sm text-ink flex-1 truncate">{item.title}</span>
                  {s && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${s.is_done ? 'text-green-400' : 'text-dim'}`}>
                      {s.name}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-panel">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dim">Move epic + {epicItems.length} items to trash?</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs rounded-[var(--c-radius-card)] text-dim hover:bg-line">Cancel</button>
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-red-500 text-white hover:opacity-90 disabled:opacity-40">
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-xs text-dim hover:text-red-400 transition-colors">Delete</button>
              <div className="flex items-center gap-2">
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                {isDirty && (
                  <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
                    className="px-4 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-40">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
