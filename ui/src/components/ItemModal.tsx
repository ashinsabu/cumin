import { useState, useEffect, useRef } from 'react'
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

type Mode = 'view' | 'edit'

export function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const { statuses, epics, moveItem, updateItem, deleteItem, selectItem } = useBoard()
  const { user } = useAuth()
  const [mode, setMode] = useState<Mode>('view')

  // Draft state for edit mode
  const [draftTitle, setDraftTitle] = useState(item.title)
  const [draftEpicId, setDraftEpicId] = useState(item.epic_id ?? '__none__')
  const [draftPriority, setDraftPriority] = useState(item.priority)
  const [draftEstimateRaw, setDraftEstimateRaw] = useState(
    item.estimate_minutes ? formatEstimate(item.estimate_minutes) : ''
  )
  const [estimateError, setEstimateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)

  const priority = PRIORITY[item.priority] ?? PRIORITY[4]
  const sprints = item.sprints ?? []
  const epicColor = item.epic_color ?? '#6b7280'

  const isDirty =
    draftTitle !== item.title ||
    (draftEpicId === '__none__' ? null : draftEpicId) !== item.epic_id ||
    draftPriority !== item.priority ||
    (draftEstimateRaw.trim() === '' ? null : parseEstimate(draftEstimateRaw)) !== item.estimate_minutes

  const initials = user?.display_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  useEffect(() => {
    if (mode === 'edit') titleInputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
        if (mode === 'edit' && isDirty) { setShowDiscardConfirm(true); return }
        if (mode === 'edit') { setMode('view'); return }
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mode, isDirty, onClose, showDeleteConfirm])

  function handleBackdropClick() {
    if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
    if (mode === 'edit' && isDirty) { setShowDiscardConfirm(true); return }
    if (mode === 'edit') { setMode('view'); return }
    onClose()
  }

  function enterEdit() {
    setDraftTitle(item.title)
    setDraftEpicId(item.epic_id ?? '__none__')
    setDraftPriority(item.priority)
    setDraftEstimateRaw(item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '')
    setEstimateError('')
    setSaveError('')
    setMode('edit')
  }

  function cancelEdit() {
    setShowDiscardConfirm(false)
    setMode('view')
  }

  async function handleSave() {
    if (!draftTitle.trim()) return

    let estimateMinutes: number | null = null
    if (draftEstimateRaw.trim()) {
      estimateMinutes = parseEstimate(draftEstimateRaw)
      if (estimateMinutes === null) {
        setEstimateError('Use formats like 2h, 30m, 1h30m')
        return
      }
    }

    setSaving(true)
    setSaveError('')
    try {
      await updateItem(item.id, {
        title: draftTitle.trim(),
        priority: draftPriority,
        estimate_minutes: estimateMinutes,
        ...(draftEpicId === '__none__'
          ? { clear_epic: true }
          : { epic_id: draftEpicId }),
      })
      setMode('view')
    } catch (err: any) {
      setSaveError(err.message || 'Save failed — changes reverted')
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

  function handleStatusChange(newStatusId: string) {
    if (newStatusId !== item.status_id) moveItem(item.id, newStatusId)
  }

  const priorities = [
    { value: 0, label: 'P0', color: '#ef4444' },
    { value: 1, label: 'P1', color: '#f97316' },
    { value: 2, label: 'P2', color: '#eab308' },
    { value: 3, label: 'P3', color: '#22c55e' },
    { value: 4, label: 'P4', color: '#6b7280' },
  ]

  const epicOptions = [
    { value: '__none__', label: 'None' },
    ...epics.map((e) => ({ value: e.id, label: e.name })),
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="raised-surface relative w-full max-w-lg rounded-[var(--c-radius-card)] shadow-xl overflow-hidden bg-raised border border-line"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: priority.bg, color: priority.color }}
              >
                {priority.label}
              </span>
              <span className="text-sm font-mono font-medium text-dim">{item.display_id}</span>
            </div>
            <div className="flex items-center gap-1">
              {mode === 'view' && (
                <button
                  onClick={enterEdit}
                  title="Edit item"
                  className="p-1.5 rounded-[var(--c-radius-card)] transition-colors hover:bg-line text-dim text-xs"
                >
                  ✎
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-[var(--c-radius-card)] transition-colors hover:bg-line text-dim"
              >
                ✕
              </button>
            </div>
          </div>

          {mode === 'view' ? (
            <h2 className="text-base font-semibold mt-2 text-ink">{item.title}</h2>
          ) : (
            <input
              ref={titleInputRef}
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="mt-2 w-full text-base font-semibold text-ink bg-transparent border-b border-line focus:border-ghost focus:outline-none pb-1"
              placeholder="Item title"
            />
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <Row label="Status">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {statuses.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStatusChange(s.id)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded transition-colors ${
                    s.id === item.status_id
                      ? s.is_done
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-accent/15 text-accent border border-accent/30'
                      : 'bg-line text-dim hover:text-ink hover:bg-raised'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Epic">
            {mode === 'view' ? (
              item.epic_name
                ? <span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ backgroundColor: epicColor + '18', color: epicColor, border: `1px solid ${epicColor}30` }}>{item.epic_name}</span>
                : <span className="text-xs text-ghost">—</span>
            ) : (
              <div className="w-48">
                <FilterSelect
                  fullWidth
                  value={draftEpicId}
                  onChange={setDraftEpicId}
                  options={epicOptions}
                />
              </div>
            )}
          </Row>

          <Row label="Priority">
            {mode === 'view' ? (
              <span className="text-sm font-bold" style={{ color: priority.color }}>{priority.label}</span>
            ) : (
              <div className="flex gap-1">
                {priorities.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setDraftPriority(p.value)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-[var(--c-radius-badge)] border transition-colors ${
                      draftPriority === p.value
                        ? 'border-current bg-current/10'
                        : 'border-line text-dim hover:border-ghost'
                    }`}
                    style={draftPriority === p.value ? { color: p.color } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </Row>

          <Row label="Estimate">
            {mode === 'view' ? (
              <span className="text-sm font-semibold text-ink/80">
                {item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}
              </span>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <input
                  type="text"
                  value={draftEstimateRaw}
                  onChange={(e) => { setDraftEstimateRaw(e.target.value); setEstimateError('') }}
                  placeholder="e.g. 2h, 30m, 1h30m"
                  className="w-36 px-2 py-1 text-sm rounded-[var(--c-radius-card)] border bg-surface border-line text-ink placeholder:text-ghost focus:outline-none focus:border-ghost"
                />
                {estimateError && <p className="text-xs text-red-500">{estimateError}</p>}
                {!estimateError && draftEstimateRaw.trim() && parseEstimate(draftEstimateRaw) !== null && (
                  <p className="text-xs text-ghost">= {formatEstimate(parseEstimate(draftEstimateRaw)!)}</p>
                )}
              </div>
            )}
          </Row>

          <Row label="Time in status">
            <div className="w-40"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
          </Row>

          {sprints.length > 0 && (
            <Row label="Sprints">
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {sprints.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded bg-line text-dim">{s}</span>
                ))}
              </div>
            </Row>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-line bg-panel">
          {showDiscardConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dim">Discard unsaved changes?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-3 py-1.5 text-xs rounded-[var(--c-radius-card)] text-dim hover:bg-line"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] text-red-600 hover:bg-red-50"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dim">Move this item to trash?</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs rounded-[var(--c-radius-card)] text-dim hover:bg-line"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-red-600 text-white hover:opacity-90 disabled:opacity-40"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ) : mode === 'view' ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ghost">
                {sprints.length > 1 ? `Spilled ${sprints.length - 1}×` : 'No spillover'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-red-500 hover:bg-red-50"
                >
                  Delete
                </button>
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent/70 flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {saveError && <p className="text-xs text-red-500">{saveError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => isDirty ? setShowDiscardConfirm(true) : setMode('view')}
                  className="px-3 py-1.5 text-sm rounded-[var(--c-radius-card)] text-dim hover:text-ink hover:bg-line"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !draftTitle.trim()}
                  className="px-4 py-1.5 text-sm font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
