import { useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const beltSpring = { type: 'spring', damping: 28, stiffness: 380, mass: 0.8 } as const
import { useQueue } from '../context/QueueContext'
import { useProjects } from '../hooks/useProjects'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useEpics } from '../hooks/useEpics'
import { parseEstimate, formatEstimate } from '../hooks/useFormat'
import type { QueueItem } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABELS = ['P0', 'P1', 'P2', 'P3', 'P4']

type SortAlgo = 'auto' | 'priority' | 'deadline' | 'shortest' | 'custom'

function sortItems(items: QueueItem[], algo: SortAlgo): QueueItem[] {
  const s = [...items]
  switch (algo) {
    case 'priority':
      return s.sort((a, b) => a.priority - b.priority || b.urgency_score - a.urgency_score)
    case 'deadline':
      return s.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0
        if (!a.deadline) return 1
        if (!b.deadline) return -1
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      })
    case 'shortest':
      return s.sort((a, b) => {
        if (!a.estimate_minutes && !b.estimate_minutes) return 0
        if (!a.estimate_minutes) return 1
        if (!b.estimate_minutes) return -1
        return a.estimate_minutes - b.estimate_minutes
      })
    case 'custom':
      return s.sort((a, b) => a.position - b.position)
    default: // auto
      return s.sort((a, b) => b.urgency_score - a.urgency_score)
  }
}

// Left rail color — hotter at top, cooler at bottom
function railClass(index: number, total: number): string {
  const pct = total <= 1 ? 0 : index / (total - 1)
  if (pct < 0.25) return 'bg-accent'
  if (pct < 0.5)  return 'bg-accent/50'
  if (pct < 0.75) return 'bg-accent/20'
  return 'bg-line'
}

function priorityBadgeClass(p: number): string {
  if (p === 0) return 'text-xs font-bold text-accent'
  if (p === 1) return 'text-xs font-semibold text-accent/70'
  if (p === 2) return 'text-xs font-medium text-dim'
  return 'text-xs text-ghost'
}

function formatDeadline(iso: string): string {
  const d = new Date(iso)
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000)
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'due today'
  if (diff === 1) return 'due tomorrow'
  return `due in ${diff}d`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Convert sheet ─────────────────────────────────────────────────────────────

type ConvertSheetProps = { item: QueueItem; onClose: () => void; onConverted: (id: string) => void }

function ConvertSheet({ item, onClose, onConverted }: ConvertSheetProps) {
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useBoardStatuses()
  const { data: epics = [] } = useEpics()
  const { promoteItem } = useQueue()
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [epicId, setEpicId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const initialStatus = statuses.find((s) => s.is_initial) ?? statuses[0]

  const submit = async () => {
    if (!projectId || !initialStatus) return
    setSubmitting(true)
    try {
      const result = await promoteItem(item.id, { project_id: projectId, status_id: initialStatus.id, epic_id: epicId || null })
      onConverted(result.item_display_id)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2">
      <p className="text-xs font-semibold text-dim uppercase tracking-wide">Convert to item</p>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
        className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-2.5 py-2 text-ink">
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={epicId} onChange={(e) => setEpicId(e.target.value)}
        className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-2.5 py-2 text-dim">
        <option value="">No epic</option>
        {epics.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      {initialStatus && <p className="text-xs text-ghost">Status: {initialStatus.name} · Priority &amp; estimate carried over</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 text-sm py-2 rounded-[var(--c-radius-card)] border border-line text-dim hover:bg-surface">Cancel</button>
        <button onClick={submit} disabled={submitting || !projectId}
          className="flex-1 text-sm py-2 rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80 disabled:opacity-50 font-medium">
          {submitting ? '...' : 'Create item ↗'}
        </button>
      </div>
    </div>
  )
}

// ─── Expanded field editor ────────────────────────────────────────────────────

type CardDraft = { title: string; priority: number; estimate: string; deadline: string; notes: string }

function itemToDraft(item: QueueItem): CardDraft {
  return {
    title: item.title,
    priority: item.priority,
    estimate: item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '',
    deadline: item.deadline ? item.deadline.slice(0, 10) : '',
    notes: item.notes,
  }
}

type ExpandedEditorProps = {
  item: QueueItem
  onClose: () => void
  onArchive: () => void
}

function ExpandedEditor({ item, onClose, onArchive }: ExpandedEditorProps) {
  const { updateItem } = useQueue()
  const [draft, setDraft] = useState<CardDraft>(itemToDraft(item))
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const originalRef = useRef<CardDraft>(itemToDraft(item))

  const isDirty = () => {
    const o = originalRef.current
    return draft.title !== o.title || draft.priority !== o.priority ||
      draft.estimate !== o.estimate || draft.deadline !== o.deadline || draft.notes !== o.notes
  }

  const save = useCallback(async () => {
    if (!isDirty() || !draft.title.trim()) return
    setSaving(true)
    try {
      await updateItem(item.id, {
        title: draft.title.trim(),
        notes: draft.notes,
        deadline: draft.deadline ? `${draft.deadline}T00:00:00Z` : null,
        priority: draft.priority,
        estimate_minutes: draft.estimate ? parseEstimate(draft.estimate) : null,
      })
      originalRef.current = { ...draft, title: draft.title.trim() }
    } catch { /* silently ignore */ }
    setSaving(false)
  }, [draft, item.id, updateItem])

  const handleClose = () => { save(); setConverting(false); onClose() }

  if (converted) {
    return (
      <div className="px-4 py-3 text-sm text-ghost italic">Converted as {converted}</div>
    )
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ ...beltSpring, damping: 35 }}
      className="overflow-hidden border-t border-line/30"
    >
      <div className="px-4 py-3 space-y-3 bg-raised/20">
        {/* Title */}
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-3 py-2 text-ink focus:outline-none focus:border-accent/50"
          placeholder="Title"
        />

        {/* Priority */}
        <div>
          <p className="text-xs text-ghost mb-1.5">Priority</p>
          <div className="flex gap-1.5 flex-wrap">
            {PRIORITY_LABELS.map((label, i) => (
              <button key={label} onClick={() => setDraft((d) => ({ ...d, priority: i }))}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  draft.priority === i
                    ? i === 0 ? 'bg-accent text-white'
                      : i === 1 ? 'bg-accent/20 text-accent'
                      : i === 2 ? 'bg-line text-dim'
                      : 'bg-line/50 text-ghost'
                    : 'text-ghost hover:text-dim hover:bg-line/50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Estimate + Deadline */}
        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-xs text-ghost mb-1.5">Estimate</p>
            <input value={draft.estimate} onChange={(e) => setDraft((d) => ({ ...d, estimate: e.target.value }))}
              placeholder="30m, 2h" className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-3 py-2 text-ink focus:outline-none focus:border-accent/50 placeholder:text-ghost" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-ghost mb-1.5">Deadline</p>
            <input type="date" value={draft.deadline} onChange={(e) => setDraft((d) => ({ ...d, deadline: e.target.value }))}
              className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-3 py-2 text-ink focus:outline-none focus:border-accent/50" />
          </div>
        </div>

        {/* Notes — clearly subordinate: smaller, paragraph style */}
        <div>
          <p className="text-xs text-ghost mb-1.5">Notes</p>
          <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Add context, links, or details..."
            rows={3}
            className="w-full text-xs leading-relaxed bg-surface border border-line rounded-[var(--c-radius-card)] px-3 py-2 text-dim resize-none focus:outline-none focus:border-accent/50 placeholder:text-ghost" />
        </div>

        {/* Actions */}
        {!converting ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setConverting(true)}
              className="flex-1 text-sm py-2 rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 font-medium transition-colors">
              Convert to item ↗
            </button>
            <button onClick={onArchive}
              className="text-sm px-3 py-2 rounded-[var(--c-radius-card)] border border-line text-dim hover:text-ink hover:border-accent/40 transition-colors">
              Remove
            </button>
            <button onClick={handleClose}
              className="text-xs px-2 py-2 rounded-[var(--c-radius-card)] text-ghost hover:text-dim transition-colors">
              {saving ? '…' : 'Done'}
            </button>
          </div>
        ) : (
          <ConvertSheet item={item} onClose={() => setConverting(false)} onConverted={(id) => { setConverting(false); setConverted(id) }} />
        )}
      </div>
    </motion.div>
  )
}

// ─── Belt item ────────────────────────────────────────────────────────────────

type BeltItemProps = {
  item: QueueItem
  index: number
  total: number
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onArchive: () => void
  isDragOver: boolean
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

function BeltItem({ item, index, total, expanded, onExpand, onCollapse, onArchive, isDragOver, dragging, onDragStart, onDragOver, onDrop, onDragEnd }: BeltItemProps) {
  const isFirst = index === 0

  return (
    <div
      className={`relative transition-opacity ${dragging ? 'opacity-40' : 'opacity-100'}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drop-here indicator */}
      {isDragOver && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent z-10" />
      )}

      <div className="flex items-stretch border-b border-line/20 last:border-0">
        {/* Left urgency rail */}
        <div className={`w-1 shrink-0 ${railClass(index, total)}`} />

        {/* Drag handle + position */}
        <div className="flex flex-col items-center justify-start pt-3.5 px-2 shrink-0 cursor-grab active:cursor-grabbing select-none">
          <span className="text-[9px] font-mono text-ghost/50 leading-none">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-ghost/30 text-[13px] mt-1 leading-none">⠿</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Clickable collapsed row */}
          <div
            className="flex items-start gap-2 pt-3 pb-2.5 pr-3 cursor-pointer group"
            onClick={expanded ? onCollapse : onExpand}
          >
            <div className="flex-1 min-w-0">
              {isFirst && !expanded && (
                <span className="inline-block text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Next up</span>
              )}
              <p className="text-sm text-ink leading-snug">{item.title}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={priorityBadgeClass(item.priority)}>{PRIORITY_LABELS[item.priority]}</span>
                {item.estimate_minutes && (
                  <span className="text-xs font-medium text-dim">{formatEstimate(item.estimate_minutes)}</span>
                )}
                {item.deadline && (
                  <span className={`text-xs font-medium ${new Date(item.deadline) < new Date() ? 'text-accent' : 'text-dim'}`}>
                    {formatDeadline(item.deadline)}
                  </span>
                )}
                {!item.deadline && !item.estimate_minutes && (
                  <span className="text-xs text-ghost">{relativeTime(item.created_at)}</span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onArchive() }}
              className="shrink-0 mt-0.5 text-base w-6 h-6 flex items-center justify-center rounded text-ghost hover:text-accent hover:bg-accent/10 transition-colors leading-none"
            >
              ×
            </button>
          </div>

          {/* Expanded editor */}
          <AnimatePresence initial={false}>
            {expanded && (
              <ExpandedEditor item={item} onClose={onCollapse} onArchive={() => { onArchive(); onCollapse() }} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ─── New item form ─────────────────────────────────────────────────────────────

function NewItemForm({ onCreate, onDiscard }: { onCreate: (t: string, p: number, e: string) => Promise<void>; onDiscard: () => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(2)
  const [estimate, setEstimate] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    try { await onCreate(title.trim(), priority, estimate) }
    catch { setSaving(false) }
  }

  return (
    <div className="border-b border-line/30 bg-raised/30">
      <div className="flex items-stretch">
        <div className="w-1 bg-accent/60 shrink-0" />
        <div className="flex-1 px-3 py-3 space-y-2.5">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onDiscard()
            }}
            placeholder="What needs attention?"
            className="w-full text-sm bg-surface border border-accent/40 rounded-[var(--c-radius-card)] px-3 py-2 text-ink focus:outline-none focus:border-accent placeholder:text-ghost"
          />
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {PRIORITY_LABELS.map((label, i) => (
                <button key={label} onClick={() => setPriority(i)}
                  className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                    priority === i
                      ? i === 0 ? 'bg-accent text-white' : i === 1 ? 'bg-accent/20 text-accent' : 'bg-line text-dim'
                      : 'text-ghost hover:text-dim'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <input
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="est."
              className="w-16 text-xs bg-surface border border-line rounded px-2 py-1 text-ink focus:outline-none focus:border-accent/50 placeholder:text-ghost"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onDiscard} className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border border-line text-dim hover:bg-surface">
              Cancel
            </button>
            <button onClick={submit} disabled={!title.trim() || saving}
              className="flex-1 text-sm py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80 disabled:opacity-50 font-medium">
              {saving ? '...' : 'Add to queue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyBelt({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-4 py-10 text-center gap-3">
      <div className="text-3xl opacity-20">⬚</div>
      <div>
        <p className="text-sm font-medium text-dim">Belt is clear</p>
        <p className="text-[11px] text-ghost mt-1 leading-relaxed">
          Capture bugs, blockers, quick decisions. Items are auto-scored by urgency and deadline.
        </p>
      </div>
      <button onClick={onAdd} className="text-sm px-4 py-2 rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 font-medium transition-colors">
        + Add first item
      </button>
    </div>
  )
}

// ─── Queue content ─────────────────────────────────────────────────────────────

type QueueContentProps = {
  sortAlgo: SortAlgo
  onSortChange: (a: SortAlgo) => void
  onClose?: () => void
  headerSize?: 'sm' | 'md'
}

function QueueContent({ sortAlgo, onSortChange, onClose, headerSize = 'sm' }: QueueContentProps) {
  const { items, loading, createItem, archiveItem, reorderItems } = useQueue()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const sortedItems = sortItems(items, sortAlgo)
  const urgentCount = items.filter((i) => i.urgency_score > 9).length

  const handleAddNew = async (title: string, priority: number, estimate: string) => {
    const estimateMinutes = estimate ? parseEstimate(estimate) : null
    await createItem({ title, priority, estimate_minutes: estimateMinutes })
    setShowNew(false)
  }

  const handleDrop = useCallback((targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    const currentOrder = sortedItems.map((i) => i.id)
    const fromIdx = currentOrder.indexOf(draggingId)
    const toIdx = currentOrder.indexOf(targetId)
    const newOrder = [...currentOrder]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, draggingId)
    setDraggingId(null)
    setDropTargetId(null)
    onSortChange('custom')
    reorderItems(newOrder)
  }, [draggingId, sortedItems, reorderItems, onSortChange])

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line shrink-0">
        <span className={`font-semibold text-ink ${headerSize === 'md' ? 'text-base' : 'text-sm'}`}>Queue</span>
        {urgentCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold">{urgentCount}</span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <select
            value={sortAlgo}
            onChange={(e) => onSortChange(e.target.value as SortAlgo)}
            className="text-xs bg-surface border border-line rounded px-2 py-1 text-dim focus:outline-none"
          >
            <option value="auto">Auto</option>
            <option value="priority">Priority</option>
            <option value="deadline">Deadline</option>
            <option value="shortest">Shortest</option>
            <option value="custom">Custom</option>
          </select>
          <button
            onClick={() => { setShowNew(true); setExpandedId(null) }}
            title="Add to queue"
            className="w-7 h-7 flex items-center justify-center rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80 font-bold text-sm shrink-0"
          >
            +
          </button>
          {onClose && (
            <button onClick={onClose} className="text-base w-6 h-6 flex items-center justify-center text-ghost hover:text-dim">×</button>
          )}
        </div>
      </div>

      {/* Belt */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {showNew && (
          <NewItemForm onCreate={handleAddNew} onDiscard={() => setShowNew(false)} />
        )}

        {loading ? (
          <p className="text-sm text-ghost p-4">Loading...</p>
        ) : sortedItems.length === 0 && !showNew ? (
          <EmptyBelt onAdd={() => setShowNew(true)} />
        ) : (
          <AnimatePresence initial={false}>
            {sortedItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={beltSpring}
              >
                <BeltItem
                  item={item}
                  index={index}
                  total={sortedItems.length}
                  expanded={expandedId === item.id}
                  onExpand={() => setExpandedId(item.id)}
                  onCollapse={() => setExpandedId(null)}
                  onArchive={() => { archiveItem(item.id); if (expandedId === item.id) setExpandedId(null) }}
                  isDragOver={dropTargetId === item.id && draggingId !== item.id}
                  dragging={draggingId === item.id}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(item.id) }}
                  onDragOver={(e) => { e.preventDefault(); setDropTargetId(item.id) }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(item.id) }}
                  onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </>
  )
}

// ─── Desktop drawer ────────────────────────────────────────────────────────────

export function QueueDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { items } = useQueue()
  const urgentCount = items.filter((i) => i.urgency_score > 9).length
  const [sortAlgo, setSortAlgo] = useState<SortAlgo>(() => (localStorage.getItem('queue_sort') as SortAlgo) ?? 'auto')

  const handleSortChange = (algo: SortAlgo) => {
    setSortAlgo(algo)
    localStorage.setItem('queue_sort', algo)
  }

  return (
    <div
      className="hidden md:flex flex-col shrink-0 border-l border-line bg-surface transition-all duration-200"
      style={{ width: open ? 300 : 28 }}
    >
      {!open ? (
        <button onClick={onToggle} className="flex-1 flex items-center justify-center bg-panel hover:bg-raised transition-colors group" title="Open queue">
          <span
            className={`text-xs font-bold transition-colors group-hover:text-dim ${urgentCount > 0 ? 'text-accent' : 'text-ghost'}`}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: 3 }}
          >
            {urgentCount > 0 ? `● ${urgentCount}` : 'QUEUE'}
          </span>
        </button>
      ) : (
        <QueueContent sortAlgo={sortAlgo} onSortChange={handleSortChange} onClose={onToggle} />
      )}
    </div>
  )
}

// ─── Mobile ────────────────────────────────────────────────────────────────────

export function QueueMobileTrigger({ onToggle }: { onToggle: () => void }) {
  const { items } = useQueue()
  const urgentCount = items.filter((i) => i.urgency_score > 9).length
  return (
    <button onClick={onToggle} className="md:hidden flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-[var(--c-radius-card)] bg-surface border border-line text-dim hover:text-ink">
      Queue
      {urgentCount > 0 && <span className="text-xs px-1.5 rounded bg-accent/10 text-accent font-semibold">{urgentCount}</span>}
    </button>
  )
}

export function QueueMobileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sortAlgo, setSortAlgo] = useState<SortAlgo>(() => (localStorage.getItem('queue_sort') as SortAlgo) ?? 'auto')

  const handleSortChange = (algo: SortAlgo) => {
    setSortAlgo(algo)
    localStorage.setItem('queue_sort', algo)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-canvas/60 z-40 md:hidden" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-surface border-t border-line rounded-t-[var(--c-radius-card)] max-h-[75vh] flex flex-col"
          >
            <QueueContent sortAlgo={sortAlgo} onSortChange={handleSortChange} onClose={onClose} headerSize="md" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
