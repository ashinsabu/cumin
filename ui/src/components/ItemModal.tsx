import { useState, useEffect } from 'react'
import type { Item } from '../types'
import { useBoard } from '../context/BoardContext'
import { useAuth } from '../context/AuthContext'
import { PRIORITY } from '../constants'
import { formatEstimate, parseEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from './StatusDurationBar'
import { FilterSelect } from './FilterSelect'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 min-h-[32px]">
      <span className="text-sm font-medium text-dim pt-1 shrink-0 w-28">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

export function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { statuses, epics, moveItem, updateItem, deleteItem, selectItem } = useBoard()
  const { user } = useAuth()

  const [title, setTitle] = useState(item.title)
  const [epicId, setEpicId] = useState(item.epic_id ?? '__none__')
  const [priority, setPriority] = useState(item.priority)
  const [estimateRaw, setEstimateRaw] = useState(item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '')
  const [estimateError, setEstimateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const priorityConfig = PRIORITY[item.priority] ?? PRIORITY[4]
  const sprints = item.sprints ?? []

  const isDirty =
    title !== item.title ||
    (epicId === '__none__' ? null : epicId) !== item.epic_id ||
    priority !== item.priority ||
    (estimateRaw.trim() === '' ? null : parseEstimate(estimateRaw)) !== item.estimate_minutes

  const initials = user?.display_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'

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
    if (!title.trim()) return
    if (estimateRaw.trim() && parseEstimate(estimateRaw) === null) {
      setEstimateError('Use formats like 2h, 30m, 1h30m')
      return
    }
    setSaving(true); setSaveError('')
    try {
      await updateItem(item.id, {
        title: title.trim(),
        priority,
        estimate_minutes: estimateRaw.trim() ? parseEstimate(estimateRaw) : null,
        ...(epicId === '__none__' ? { clear_epic: true } : { epic_id: epicId }),
      })
      onClose()
    } catch (err: any) {
      setSaveError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteItem(item.id)
      selectItem(null)
      onClose()
    } catch {
      setDeleting(false)
      setShowDeleteConfirm(false)
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg rounded-[var(--c-radius-card)] shadow-xl overflow-hidden bg-raised border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ backgroundColor: priorityConfig.bg, color: priorityConfig.color }}>
                {priorityConfig.label}
              </span>
              <span className="text-sm font-mono font-medium text-dim">{item.display_id}</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[var(--c-radius-card)] hover:bg-line text-dim transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-base font-semibold text-ink bg-transparent focus:outline-none placeholder:text-ghost"
            placeholder="Item title"
          />
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <Row label="Status">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {statuses.map((s) => (
                <button key={s.id} type="button" onClick={() => s.id !== item.status_id && moveItem(item.id, s.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                    s.id === item.status_id
                      ? s.is_done ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-line text-dim hover:text-ink hover:bg-raised'
                  }`}>
                  {s.name}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Epic">
            <div className="w-48">
              <FilterSelect
                fullWidth
                value={epicId}
                onChange={setEpicId}
                options={[{ value: '__none__', label: 'None' }, ...epics.map((e) => ({ value: e.id, label: e.name }))]}
              />
            </div>
          </Row>

          <Row label="Priority">
            <div className="flex gap-1">
              {priorities.map((p) => (
                <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[var(--c-radius-badge)] border transition-colors ${
                    priority === p.value ? 'border-current bg-current/10' : 'border-line text-dim hover:border-ghost'
                  }`}
                  style={priority === p.value ? { color: p.color } : undefined}>
                  {p.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Estimate">
            <div className="flex flex-col items-end gap-1">
              <input type="text" value={estimateRaw} onChange={(e) => { setEstimateRaw(e.target.value); setEstimateError('') }}
                placeholder="e.g. 2h, 30m"
                className="w-36 px-2 py-1 text-sm rounded-[var(--c-radius-card)] border bg-surface border-line text-ink placeholder:text-ghost focus:outline-none focus:border-ghost" />
              {estimateError && <p className="text-xs text-red-500">{estimateError}</p>}
              {!estimateError && estimateRaw.trim() && parseEstimate(estimateRaw) !== null && (
                <p className="text-xs text-ghost">= {formatEstimate(parseEstimate(estimateRaw)!)}</p>
              )}
            </div>
          </Row>

          <Row label="Time in status">
            <div className="w-40"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
          </Row>

          {sprints.length > 0 && (
            <Row label="Sprints">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {sprints.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded bg-line text-dim">{s}</span>)}
              </div>
            </Row>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-panel">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dim">Move to trash?</span>
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
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowDeleteConfirm(true)} className="text-xs text-dim hover:text-red-400 transition-colors">Delete</button>
                <span className="text-xs text-ghost">{sprints.length > 1 ? `Spilled ${sprints.length - 1}×` : 'No spillover'}</span>
              </div>
              <div className="flex items-center gap-2">
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                {isDirty && (
                  <button type="button" onClick={handleSave} disabled={saving || !title.trim()}
                    className="px-4 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-40">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-xs font-bold">{initials}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
