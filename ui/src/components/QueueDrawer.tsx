import { useState, useRef, useCallback, useEffect, forwardRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const beltSpring = { type: 'spring', damping: 28, stiffness: 380, mass: 0.8 } as const
import { useQueue } from '../context/QueueContext'
import { useProjects } from '../hooks/useProjects'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { useEpics } from '../hooks/useEpics'
import { parseEstimate, formatEstimate } from '../hooks/useFormat'
import { PRIORITY } from '../constants'
import { Select } from './ui'
import { NO_SPRINT, sprintOptions, useSprintOptions } from './SprintSelect'
import { useSprints } from '../hooks/useSprints'
import type { QueueItem } from '../types'
import { authFetch } from '../lib/auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STALE_MS = 24 * 60 * 60 * 1000

function isStale(item: QueueItem): boolean {
  return Date.now() - new Date(item.created_at).getTime() > STALE_MS
}

type SortAlgo = 'auto' | 'priority' | 'shortest' | 'custom'

// Items the server says cannot fit in today (see server/queue/attention.go). Drives the collapsed-tab badge.
function pulseCount(items: QueueItem[]): number {
  return items.filter((i) => !isStale(i) && i.attention?.level === 'pulse').length
}

// Load meter colour: calm under 6h of planned work, accent up to the 8h budget, danger past it.
function loadClass(plannedMinutes: number, budgetMinutes: number): string {
  if (plannedMinutes > budgetMinutes) return 'bg-danger/10 text-danger'
  if (plannedMinutes >= budgetMinutes * 0.75) return 'bg-accent/10 text-accent'
  return 'bg-line text-dim'
}

function sortItems(items: QueueItem[], algo: SortAlgo): QueueItem[] {
  const s = [...items]
  switch (algo) {
    case 'priority':
      return s.sort((a, b) => a.priority - b.priority || b.urgency_score - a.urgency_score)
    case 'shortest':
      return s.sort((a, b) => {
        if (!a.estimate_minutes && !b.estimate_minutes) return 0
        if (!a.estimate_minutes) return 1
        if (!b.estimate_minutes) return -1
        return a.estimate_minutes - b.estimate_minutes
      })
    case 'custom':
      return s.sort((a, b) => a.position - b.position)
    default:
      return s.sort((a, b) => b.urgency_score - a.urgency_score)
  }
}

function railClass(index: number, total: number): string {
  const pct = total <= 1 ? 0 : index / (total - 1)
  if (pct < 0.25) return 'bg-accent'
  if (pct < 0.5)  return 'bg-accent/50'
  if (pct < 0.75) return 'bg-accent/20'
  return 'bg-line'
}

function PriorityBadge({ p }: { p: number }) {
  const cfg = PRIORITY[p] ?? PRIORITY[4]
  return <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Age bar: shows how much of the 24h window has elapsed. Green → amber → red.
function AgeBar({ createdAt }: { createdAt: string }) {
  const elapsed = Date.now() - new Date(createdAt).getTime()
  const pct = Math.min((elapsed / STALE_MS) * 100, 100)
  // Only show when >75% elapsed (~18h) — signals imminent expiry, not just age
  if (pct < 75) return null
  const barClass = pct >= 90 ? 'bg-red-500' : 'bg-orange-400'
  return (
    <div className="w-full h-0.5 bg-line/30 rounded-full overflow-hidden mt-1.5">
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
    </div>
  )
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
  const [sprintId, setSprintId] = useState(NO_SPRINT)
  const [submitting, setSubmitting] = useState(false)

  const sprintOptions = useSprintOptions(projectId, sprintId)
  const initialStatus = statuses.find((s) => s.is_initial) ?? statuses[0]

  const submit = async () => {
    if (!projectId || !initialStatus) return
    setSubmitting(true)
    try {
      const result = await promoteItem(item.id, { project_id: projectId, status_id: initialStatus.id, epic_id: epicId || null, sprint_id: sprintId === NO_SPRINT ? null : sprintId })
      onConverted(result.item_display_id)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-line space-y-2.5">
      <p className="text-xs font-semibold text-dim uppercase tracking-wide">Send to board</p>
      <ConvertField label="Project">
        <Select
          size="xs"
          value={projectId}
          onChange={(v) => { setProjectId(v); setSprintId(NO_SPRINT) }}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
        />
      </ConvertField>
      <ConvertField label="Epic">
        <Select
          size="xs"
          value={epicId}
          onChange={setEpicId}
          options={[{ value: '', label: 'No epic' }, ...epics.map((e) => ({ value: e.id, label: e.name }))]}
        />
      </ConvertField>
      {sprintOptions.length > 0 && (
        <ConvertField label="Sprint">
          <Select size="xs" value={sprintId} onChange={setSprintId} options={sprintOptions} />
        </ConvertField>
      )}
      {initialStatus && <p className="text-xs text-ghost">Starts in {initialStatus.name}; priority and estimate carry over</p>}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 text-xs py-2 rounded-[var(--c-radius-card)] border border-line text-dim hover:bg-surface">Cancel</button>
        <button onClick={submit} disabled={submitting || !projectId}
          className="flex-1 text-xs py-2 whitespace-nowrap rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80 disabled:opacity-50 font-medium">
          {submitting ? '...' : 'Send to board'}
        </button>
      </div>
    </div>
  )
}

function ConvertField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-dim mb-1">{label}</span>
      {children}
    </label>
  )
}

// ─── Expanded field editor ────────────────────────────────────────────────────

type CardDraft = { title: string; priority: number; estimate: string; notes: string }

function itemToDraft(item: QueueItem): CardDraft {
  return {
    title: item.title,
    priority: item.priority,
    estimate: item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '',
    notes: item.notes,
  }
}

type ExpandedEditorProps = {
  item: QueueItem
}

export function ExpandedEditor({ item }: ExpandedEditorProps) {
  const { updateItem } = useQueue()
  const [draft, setDraft] = useState<CardDraft>(itemToDraft(item))
  const [converting, setConverting] = useState(false)
  const [converted, setConverted] = useState<string | null>(null)
  const originalRef = useRef<CardDraft>(itemToDraft(item))
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft }, [draft])

  const save = useCallback(async () => {
    const d = draftRef.current
    const o = originalRef.current
    const dirty = d.title !== o.title || d.priority !== o.priority ||
      d.estimate !== o.estimate || d.notes !== o.notes
    if (!dirty || !d.title.trim()) return
    try {
      await updateItem(item.id, {
        title: d.title.trim(),
        notes: d.notes,
        priority: d.priority,
        estimate_minutes: d.estimate ? parseEstimate(d.estimate) : null,
      })
      originalRef.current = { ...d, title: d.title.trim() }
    } catch { /* silently ignore */ }
  }, [item.id, updateItem])

  // Priority / estimate / due are click-or-type fields with no blur-to-save of their own;
  // persist them shortly after they change (title and notes still save on blur).
  useEffect(() => {
    const t = setTimeout(save, 500)
    return () => clearTimeout(t)
  }, [draft.priority, draft.estimate, save])

  if (converted) {
    return (
      <div className="px-4 py-3 text-sm text-ghost italic">Sent to board as {converted}</div>
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
      <div className="px-3 py-3 space-y-2.5 bg-raised/20">
        <input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onBlur={save}
          className="w-full text-sm bg-surface border border-line rounded-[var(--c-radius-card)] px-2.5 py-1.5 text-ink focus:outline-none focus:border-accent/50"
          placeholder="Title"
        />
        {/* Priority row */}
        <div className="flex gap-1">
          {[0,1,2,3,4].map((i) => {
            const cfg = PRIORITY[i]
            const active = draft.priority === i
            return (
              <button key={i} onClick={() => setDraft((d) => ({ ...d, priority: i }))}
                className="px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer border"
                style={active ? { color: cfg.color, borderColor: cfg.color, backgroundColor: cfg.color + '18' } : { color: '#6b7280', borderColor: 'transparent' }}>
                {cfg.label}
              </button>
            )
          })}
        </div>
        {/* Estimate row */}
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-ghost uppercase tracking-wide">Estimate</p>
          <div className="flex items-center gap-1 flex-wrap">
            {['15m','30m','1h','2h'].map((t) => (
              <button key={t} type="button" onClick={() => setDraft((d) => ({ ...d, estimate: d.estimate === t ? '' : t }))}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer border ${
                  draft.estimate === t ? 'text-accent border-accent bg-accent/10' : 'text-ghost border-transparent hover:border-line'
                }`}>
                {t}
              </button>
            ))}
            <input value={['15m','30m','1h','2h'].includes(draft.estimate) ? '' : draft.estimate}
              onChange={(e) => setDraft((d) => ({ ...d, estimate: e.target.value }))}
              placeholder="Custom"
              className="w-20 ml-1 text-xs bg-surface border border-line rounded-[var(--c-radius-card)] px-2 py-0.5 text-ink focus:outline-none focus:border-accent/50 placeholder:text-ghost" />
          </div>
        </div>
        {/* Notes */}
        <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          onBlur={save}
          placeholder="Notes..."
          rows={2}
          className="w-full text-xs leading-relaxed bg-surface border border-line rounded-[var(--c-radius-card)] px-2.5 py-1.5 text-dim resize-none focus:outline-none focus:border-accent/50 placeholder:text-ghost" />
        {!converting ? (
          <div className="flex items-center gap-2 pt-0.5">
            <button onClick={() => setConverting(true)}
              className="text-xs text-dim hover:text-ink transition-colors">
              Send to board →
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
  onComplete: () => void
  isDragOver: boolean
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}

const BeltItem = forwardRef<HTMLDivElement, BeltItemProps>(function BeltItem({ item, index, total, expanded, onExpand, onCollapse, onArchive, onComplete, isDragOver, dragging, onDragStart, onDragOver, onDrop, onDragEnd }, ref) {
  const isFirst = index === 0
  const [done, setDone] = useState(false)

  const handleDone = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDone(true)
    setTimeout(() => onComplete(), 350)
  }

  return (
    <div
      ref={ref}
      className={`relative group/belt transition-opacity ${dragging ? 'opacity-40' : 'opacity-100'}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {isDragOver && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent z-10" />
      )}
      <div className={`flex items-stretch border-b border-line/20 last:border-0 ${
        item.attention?.level === 'pulse' ? 'queue-pulse' : item.attention?.level === 'watch' ? 'bg-accent/5' : ''
      }`}>
        <div className={`w-1 shrink-0 ${railClass(index, total)}`} />
        <div className="flex flex-col items-center justify-start pt-3.5 px-2 shrink-0 cursor-grab active:cursor-grabbing select-none">
          <span className="text-[9px] font-mono text-ghost/50 leading-none">{String(index + 1).padStart(2, '0')}</span>
          <span className="text-ghost/30 text-[13px] mt-1 leading-none">⠿</span>
        </div>
        <div className="flex-1 min-w-0">
          {/* Clickable header — collapses/expands */}
          <div
            className="pt-3 pb-2 pl-0 pr-2 cursor-pointer"
            onClick={expanded ? onCollapse : onExpand}
          >
            {isFirst && !expanded && (
              <span className="inline-block text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Next up</span>
            )}
            <p className={`text-sm leading-snug transition-all duration-300 ${done ? 'line-through text-ghost' : 'text-ink'}`}>{item.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PriorityBadge p={item.priority} />
              {item.estimate_minutes && (
                <span className="text-xs font-medium text-dim">est {formatEstimate(item.estimate_minutes)}</span>
              )}
              {item.attention && item.attention.level !== 'calm' && (
                <span title={item.attention.reason} className="text-xs font-medium text-accent">
                  {item.attention.level === 'pulse' ? '● Won’t fit today' : '● Tight'}
                </span>
              )}
            </div>
            <AgeBar createdAt={item.created_at} />
          </div>
          {/* Editor — not clickable, stops propagation */}
          <AnimatePresence initial={false}>
            {expanded && (
              <div onClick={(e) => e.stopPropagation()}>
                <ExpandedEditor item={item} />
              </div>
            )}
          </AnimatePresence>
        </div>
        {/* ✓ / × — always rendered; fade in on hover when collapsed, always visible when expanded */}
        <button
          onClick={handleDone}
          title="Mark done"
          className={`w-8 shrink-0 flex items-center justify-center border-l transition-all text-sm font-bold ${
            done
              ? 'border-green-500/30 bg-green-500/20 text-green-500'
              : 'border-line/20 bg-green-500/10 text-green-500/70 hover:text-green-500 hover:bg-green-500/25 hover:border-green-500/30'
          }`}
        >
          ✓
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArchive() }}
          title="Dismiss"
          className="w-8 shrink-0 flex items-center justify-center border-l border-line/20 bg-raised/40 text-ghost/70 hover:text-accent hover:bg-accent/15 hover:border-accent/30 transition-all text-base"
        >
          ×
        </button>
      </div>
    </div>
  )
})

// ─── Stale (archived) section ─────────────────────────────────────────────────

function StaleSection({ items }: { items: QueueItem[] }) {
  const [open, setOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const { reviveItem, archiveItem, deleteItemSilent, completeItem, promoteItem } = useQueue()
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useBoardStatuses()
  const { data: epics = [] } = useEpics()
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set())
  const [convertingProjectId, setConvertingProjectId] = useState('')
  const [convertingEpicId, setConvertingEpicId] = useState('')
  const [convertingSprintId, setConvertingSprintId] = useState(NO_SPRINT)
  const { data: allSprints = [] } = useSprints()

  if (items.length === 0) return null

  const visibleItems = items.filter((i) => !convertedIds.has(i.id))
  const allSelected = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id))
  const initialStatus = statuses.find((s) => s.is_initial) ?? statuses[0]

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(visibleItems.map((i) => i.id)))
  }

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()) }

  const runBulk = async (action: (id: string) => Promise<void> | void) => {
    if (!selected.size || busy) return
    setBusy(true)
    await Promise.all([...selected].map((id) => action(id)))
    setSelected(new Set())
    setBusy(false)
    if (visibleItems.filter((i) => !selected.has(i.id)).length === 0) exitSelectMode()
  }

  const bulkRevive  = () => runBulk((id) => reviveItem(id))
  const bulkDelete  = () => runBulk((id) => deleteItemSilent(id))
  const bulkDone    = () => runBulk((id) => completeItem(id))

  return (
    <div className="border-t border-line/30 mt-auto shrink-0">
      {/* Section header */}
      <div className="flex items-center px-3 py-2 gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-1.5 text-xs text-ghost hover:text-dim transition-colors text-left"
        >
          <span className="font-medium">
            {open ? '↑' : '↓'} Yesterday · {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
          <span className="text-ghost/40">auto-archived</span>
        </button>
        {open && !selectMode && (
          <button
            onClick={() => setSelectMode(true)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-line/40 text-ghost/50 hover:text-dim hover:border-line transition-colors shrink-0"
          >
            Select
          </button>
        )}
        {open && selectMode && (
          <button onClick={exitSelectMode} className="text-[10px] text-ghost/50 hover:text-dim transition-colors shrink-0">
            Cancel
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ ...beltSpring, damping: 35 }}
            className="overflow-hidden"
          >
            {/* Select-all row */}
            {selectMode && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line/10 bg-raised/20">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="accent-[color:var(--c-accent)] w-3.5 h-3.5 cursor-pointer" />
                <span className="text-[10px] text-ghost">
                  {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                </span>
              </div>
            )}

            {visibleItems.map((item) => {
              const isConverting = convertingId === item.id
              const isSelected = selected.has(item.id)

              return (
                <div
                  key={item.id}
                  className={`flex items-stretch border-b border-line/10 last:border-0 transition-opacity ${
                    selectMode && isSelected ? 'opacity-100 bg-accent/5' : 'opacity-50 hover:opacity-70'
                  }`}
                  onClick={selectMode ? () => toggleSelect(item.id) : undefined}
                  style={selectMode ? { cursor: 'pointer' } : undefined}
                >
                  {selectMode && (
                    <div className="flex items-center pl-3 pr-1 shrink-0">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="accent-[color:var(--c-accent)] w-3.5 h-3.5 cursor-pointer" />
                    </div>
                  )}
                  {!selectMode && <div className="w-1 shrink-0 bg-line/30" />}
                  <div className="flex-1 min-w-0 px-3 py-2.5">
                    <p className="text-xs text-dim leading-snug truncate">{item.title}</p>
                    <p className="text-[10px] text-ghost mt-0.5">{relativeTime(item.created_at)}</p>

                    {!selectMode && isConverting ? (
                      <div className="mt-2 space-y-1.5">
                        <Select
                          size="xs"
                          value={convertingProjectId || projects[0]?.id || ''}
                          onChange={(v) => { setConvertingProjectId(v); setConvertingSprintId(NO_SPRINT) }}
                          options={projects.map((p) => ({ value: p.id, label: p.name }))}
                        />
                        <Select
                          size="xs"
                          value={convertingEpicId}
                          onChange={setConvertingEpicId}
                          options={[{ value: '', label: 'No epic' }, ...epics.map((e) => ({ value: e.id, label: e.name }))]}
                        />
                        {(() => {
                          const options = sprintOptions(allSprints, convertingProjectId || projects[0]?.id, convertingSprintId)
                          return options.length > 0 && <Select size="xs" value={convertingSprintId} onChange={setConvertingSprintId} options={options} />
                        })()}
                        <div className="flex gap-1.5">
                          <button onClick={() => setConvertingId(null)}
                            className="flex-1 text-xs py-1.5 rounded border border-line text-ghost hover:text-dim">
                            Cancel
                          </button>
                          <button
                            onClick={async () => {
                              const projectId = convertingProjectId || projects[0]?.id
                              if (!projectId || !initialStatus) return
                              await promoteItem(item.id, { project_id: projectId, status_id: initialStatus.id, epic_id: convertingEpicId || null, sprint_id: convertingSprintId === NO_SPRINT ? null : convertingSprintId })
                              setConvertedIds((s) => new Set([...s, item.id]))
                              setConvertingId(null)
                            }}
                            className="flex-1 text-xs py-1.5 rounded bg-accent/10 text-accent hover:bg-accent/20 font-medium">
                            Create ↗
                          </button>
                        </div>
                      </div>
                    ) : !selectMode && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <button
                          onClick={() => reviveItem(item.id)}
                          className="text-[10px] px-2 py-0.5 rounded border border-line/50 text-ghost hover:text-dim hover:border-line transition-colors"
                        >
                          ↩ Revive
                        </button>
                        <button
                          onClick={() => { setConvertingProjectId(''); setConvertingEpicId(''); setConvertingSprintId(NO_SPRINT); setConvertingId(item.id) }}
                          className="text-[10px] px-2 py-0.5 rounded border border-line/50 text-ghost hover:text-accent hover:border-accent/40 transition-colors"
                        >
                          → Send to board
                        </button>
                        <button
                          onClick={() => archiveItem(item.id)}
                          className="ml-auto text-[10px] text-ghost/40 hover:text-ghost transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Floating bulk action bar */}
            <AnimatePresence>
              {selectMode && selected.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5 px-3 py-2.5 border-t border-accent/20 bg-raised"
                >
                  <span className="text-[10px] text-ghost shrink-0 mr-0.5">{selected.size}</span>
                  <button
                    onClick={bulkRevive}
                    disabled={busy}
                    className="flex-1 text-[10px] py-1.5 rounded border border-line text-dim hover:text-ink hover:border-accent/40 transition-colors disabled:opacity-40 font-medium"
                  >
                    ↩ Revive
                  </button>
                  <button
                    onClick={bulkDone}
                    disabled={busy}
                    className="flex-1 text-[10px] py-1.5 rounded border border-green-500/30 text-green-500/70 hover:bg-green-500/10 hover:text-green-500 transition-colors disabled:opacity-40 font-medium"
                  >
                    ✓ Done
                  </button>
                  <button
                    onClick={bulkDelete}
                    disabled={busy}
                    className="flex-1 text-[10px] py-1.5 rounded border border-line text-ghost hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-40"
                  >
                    × Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── New item form ─────────────────────────────────────────────────────────────

function NewItemForm({ onCreate, onDiscard }: { onCreate: (t: string, p: number, e: string) => void; onDiscard: () => void }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(2)
  const [estimate, setEstimate] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onCreate(title.trim(), priority, estimate)
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
          <div className="flex gap-1">
            {[0,1,2,3,4].map((i) => {
              const cfg = PRIORITY[i]
              const active = priority === i
              return (
                <button key={i} onClick={() => setPriority(i)}
                  className="px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer border"
                  style={active ? { color: cfg.color, borderColor: cfg.color, backgroundColor: cfg.color + '18' } : { color: '#6b7280', borderColor: 'transparent' }}>
                  {cfg.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-ghost mr-0.5">est.</span>
            {['15m', '30m', '1h', '2h'].map((t) => (
              <button key={t} type="button" onClick={() => setEstimate((prev) => prev === t ? '' : t)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer border ${
                  estimate === t
                    ? 'text-accent border-accent bg-accent/10'
                    : 'text-ghost border-transparent'
                }`}>
                {t}
              </button>
            ))}
            <input
              value={['15m','30m','1h','2h'].includes(estimate) ? '' : estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="other"
              className="w-12 text-xs bg-surface border border-line rounded px-2 py-0.5 text-ink focus:outline-none focus:border-accent/50 placeholder:text-ghost"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={onDiscard} className="text-sm px-3 py-1.5 rounded-[var(--c-radius-card)] border border-line text-dim hover:bg-surface">
              Cancel
            </button>
            <button onClick={submit} disabled={!title.trim()}
              className="flex-1 text-sm py-1.5 rounded-[var(--c-radius-card)] bg-accent text-white hover:bg-accent/80 disabled:opacity-50 font-medium">
              Add to queue
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
        <p className="text-sm font-medium text-dim">No quick tasks</p>
        <p className="text-[11px] text-ghost mt-1 leading-relaxed">
          Capture bugs, blockers, quick decisions.<br />
          Quick tasks stay in this queue — they don't appear on the board.<br />
          Items older than 24h auto-archive below.
        </p>
      </div>
      <button onClick={onAdd} className="text-sm px-4 py-2 rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 font-medium transition-colors">
        + Add quick task
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
  const { items, summary, loading, createItem, archiveItem, completeItem, reorderItems } = useQueue()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const activeItems = items.filter((i) => !isStale(i))
  const staleItems = items.filter((i) => isStale(i))
  const sortedActive = sortItems(activeItems, sortAlgo)

  const handleAddNew = (title: string, priority: number, estimate: string) => {
    const estimateMinutes = estimate ? parseEstimate(estimate) : null
    setShowNew(false)
    createItem({ title, priority, estimate_minutes: estimateMinutes })
  }

  const expandedItemRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expandedId) return
    const handler = (e: MouseEvent) => {
      if (expandedItemRef.current && !expandedItemRef.current.contains(e.target as Node)) {
        setExpandedId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expandedId])

  const handleDrop = useCallback((targetId: string) => {
    if (!draggingId || draggingId === targetId) return
    const currentOrder = sortedActive.map((i) => i.id)
    const fromIdx = currentOrder.indexOf(draggingId)
    const toIdx = currentOrder.indexOf(targetId)
    const newOrder = [...currentOrder]
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, draggingId)
    setDraggingId(null)
    setDropTargetId(null)
    onSortChange('custom')
    reorderItems(newOrder)
  }, [draggingId, sortedActive, reorderItems, onSortChange])

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line shrink-0">
        <span className={`font-semibold text-ink truncate min-w-0 ${headerSize === 'md' ? 'text-base' : 'text-sm'}`}>Quick Task Queue</span>
        {activeItems.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-line text-ghost font-mono shrink-0">{activeItems.length}</span>
        )}
        {summary && summary.planned_minutes > 0 && (
          <span
            title={`${formatEstimate(summary.planned_minutes)} planned of a ${formatEstimate(summary.budget_minutes)} day${summary.unestimated_count > 0 ? ` · ${summary.unestimated_count} without an estimate` : ''}`}
            className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 whitespace-nowrap ${loadClass(summary.planned_minutes, summary.budget_minutes)}`}
          >
            {formatEstimate(summary.planned_minutes)} / {formatEstimate(summary.budget_minutes)}{summary.unestimated_count > 0 ? ` +${summary.unestimated_count}?` : ''}
          </span>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <Select
            size="xs"
            value={sortAlgo}
            onChange={(v) => onSortChange(v as SortAlgo)}
            options={[
              { value: 'auto',     label: 'Auto' },
              { value: 'priority', label: 'Priority' },
              { value: 'shortest', label: 'Shortest' },
              { value: 'custom',   label: 'Custom' },
            ]}
            className="w-24"
          />
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
        ) : sortedActive.length === 0 && !showNew ? (
          <EmptyBelt onAdd={() => setShowNew(true)} />
        ) : (
          <AnimatePresence initial={false}>
            {sortedActive.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={beltSpring}
              >
                <BeltItem
                  ref={expandedId === item.id ? expandedItemRef : null}
                  item={item}
                  index={index}
                  total={sortedActive.length}
                  expanded={expandedId === item.id}
                  onExpand={() => setExpandedId(item.id)}
                  onCollapse={() => setExpandedId(null)}
                  onArchive={() => { archiveItem(item.id); if (expandedId === item.id) setExpandedId(null) }}
                  onComplete={() => { completeItem(item.id); if (expandedId === item.id) setExpandedId(null) }}
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

      {/* Stale section always at bottom */}
      <StaleSection items={staleItems} />

      {/* Done history */}
      <HistorySection />
    </>
  )
}

function HistorySection() {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<QueueItem[]>([])

  const load = async () => {
    const res = await authFetch(`/api/queue/history`)
    if (res.ok) {
      const data = await res.json()
      setHistory(data.items ?? [])
    }
    setOpen(true)
  }

  const toggle = () => open ? setOpen(false) : load()

  const fmt = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <div className="border-t border-line/20">
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ghost hover:text-dim transition-colors">
        <span>Done history {history.length > 0 && `(${history.length})`}</span>
        <span>{open ? '↑' : '↓'}</span>
      </button>
      {open && (
        <div className="pb-2">
          {history.length === 0 ? (
            <p className="text-xs text-ghost px-4 py-2">Nothing marked done yet</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-1.5 border-b border-line/10 last:border-0">
                <span className="text-green-500/60 text-xs">✓</span>
                <span className="flex-1 text-xs text-ghost line-through leading-snug">{item.title}</span>
                <span className="text-[10px] text-ghost/50 shrink-0">{fmt(item.completed_at!)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Desktop drawer ────────────────────────────────────────────────────────────

export function QueueDrawer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { items } = useQueue()
  const pulsing = pulseCount(items)
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
            className={`text-xs font-bold transition-colors group-hover:text-dim ${pulsing > 0 ? 'text-accent' : 'text-ghost'}`}
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: 3 }}
          >
            {pulsing > 0 ? `● ${pulsing}` : 'QUEUE'}
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
  const pulsing = pulseCount(items)
  return (
    <button onClick={onToggle} className="md:hidden flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-[var(--c-radius-card)] bg-surface border border-line text-dim hover:text-ink">
      Queue
      {pulsing > 0 && <span className="text-xs px-1.5 rounded bg-accent/10 text-accent font-semibold">{pulsing}</span>}
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
