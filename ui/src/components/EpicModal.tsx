import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Epic } from '../types'
import { useBoard } from '../context/BoardContext'
import { formatEstimate } from '../hooks/useFormat'
import { ItemRow } from './item/ItemRow'
import { QuickAddItem } from './item/QuickAddItem'
import { fade, slideRight, slideUp } from '../lib/motionVariants'

const API = import.meta.env.VITE_API_URL ?? ''

type PanelMode = 'open' | 'minimized'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-line last:border-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-ghost pt-0.5 shrink-0 w-24">{label}</span>
      <div className="flex-1 flex justify-end">{children}</div>
    </div>
  )
}

const TYPE_STYLES: Record<string, string> = {
  recurring: 'bg-green-500/10 text-green-400 border border-green-500/20',
  goal:      'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  catchall:  'bg-line text-dim border border-line',
}


export function EpicModal({ epic, onClose }: { epic: Epic; onClose: () => void }) {
  const { items, statuses, deleteEpic, selectEpic, selectItem, refresh } = useBoard()

  const [mode, setMode] = useState<PanelMode>('open')
  const [name, setName] = useState(epic.name)
  const [description, setDescription] = useState(epic.description ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const epicItems = items.filter((i) => i.epic_id === epic.id)
  const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
  const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
  const doneEstimate = doneItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
  const progress = totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0

  const isDirty = name !== epic.name || description !== (epic.description ?? '')

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (mode === 'minimized') { setMode('open'); return }
        if (showDeleteConfirm) { setShowDeleteConfirm(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, showDeleteConfirm, mode])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch(`${API}/api/epics/${epic.id}`, {
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
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleDelete() {
    deleteEpic(epic.id)
    selectEpic(null)
    onClose()
  }

  if (mode === 'minimized') {
    return (
      <motion.div
        variants={slideUp}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-lg bg-raised border border-line cursor-pointer hover:border-accent/40 transition-colors"
        onClick={() => setMode('open')}
      >
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
        <span className="text-sm font-semibold text-ink max-w-[160px] truncate">{epic.name}</span>
        <span className="text-xs text-ghost">{doneItems.length}/{epicItems.length}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="ml-1 text-ghost hover:text-ink transition-colors leading-none"
        >×</button>
      </motion.div>
    )
  }

  return (
    <>
      <motion.div
        variants={fade}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      <motion.div
        variants={slideRight}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[520px] bg-raised shadow-2xl border-l border-line overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-5 py-3.5 border-b border-line bg-panel flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${TYPE_STYLES[epic.type] ?? TYPE_STYLES.catchall}`}>
              {epic.type}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setMode('minimized')} title="Minimize"
              className="p-1.5 rounded hover:bg-line text-ghost hover:text-dim transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <button onClick={onClose} title="Close"
              className="p-1.5 rounded hover:bg-line text-ghost hover:text-dim transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Title + description */}
          <div className="px-6 py-5 border-b border-line">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-lg font-bold text-ink bg-transparent focus:outline-none placeholder:text-ghost mb-2"
              placeholder="Epic name"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={3}
              className="w-full text-sm text-dim bg-transparent focus:outline-none placeholder:text-ghost resize-none leading-relaxed"
            />
          </div>

          {/* Progress */}
          <div className="px-6 py-4 border-b border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ghost">Progress</span>
              <span className="text-sm font-bold text-ink">{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-ghost">{doneItems.length} done</span>
              <span className="text-xs text-ghost">{epicItems.length} total</span>
            </div>
          </div>

          {/* Stats */}
          <div className="px-6 py-2">
            <Row label="Estimate">
              <span className="text-sm font-semibold text-ink">{totalEstimate ? formatEstimate(totalEstimate) : '—'}</span>
            </Row>
            {epic.deadline && (
              <Row label="Deadline">
                <span className="text-sm text-ink">
                  {new Date(epic.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </Row>
            )}
          </div>

          {/* Items section */}
          <div className="px-6 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ghost">Items</span>
              <button
                type="button"
                onClick={() => setShowQuickAdd((v) => !v)}
                className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
              >
                + Add item
              </button>
            </div>
          </div>

          <div className="border-t border-line">
            {showQuickAdd && (
              <QuickAddItem epicId={epic.id} onDone={() => { setShowQuickAdd(false); refresh() }} />
            )}
            {epicItems.length > 0 ? (
              epicItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onSelect={(i) => selectItem(i)}
                  columns={{ id: true, priority: true, title: true, estimate: true, status: true }}
                />
              ))
            ) : (
              !showQuickAdd && (
                <div className="px-4 py-6 text-center text-sm text-ghost">
                  No items yet.{' '}
                  <button type="button" onClick={() => setShowQuickAdd(true)} className="text-accent hover:underline">Add one</button>
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 border-t border-line bg-panel">
          {showDeleteConfirm ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-dim">Move epic + {epicItems.length} items to trash?</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs rounded text-dim hover:bg-line transition-colors">Cancel</button>
                <button type="button" onClick={handleDelete}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-red-500 text-white hover:opacity-90 transition-opacity">
                  Confirm Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setShowDeleteConfirm(true)}
                className="text-xs text-dim hover:text-red-400 transition-colors">
                Delete epic
              </button>
              <div className="flex items-center gap-3">
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                {isDirty && (
                  <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
                    className="px-4 py-1.5 text-sm font-semibold rounded bg-accent text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
