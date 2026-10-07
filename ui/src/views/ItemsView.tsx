import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBoard } from '../context/BoardContext'
import { useItems } from '../hooks/useItems'
import { useEpics } from '../hooks/useEpics'
import { useProjects } from '../hooks/useProjects'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { usePersistentState } from '../hooks/usePersistentState'
import { useCreateView, type ViewFilters } from '../hooks/useSavedViews'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'
import { CreateItemModal } from '../components/CreateItemModal'
import type { Item } from '../types'

const MIDDLE_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']

type ColumnConfig = {
  id: string
  label: string
  width: number
  visible: boolean
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'id',       label: 'ID',        width: 90,  visible: true },
  { id: 'title',    label: 'Work',      width: 300, visible: true },
  { id: 'project',  label: 'Project',   width: 120, visible: true },
  { id: 'epic',     label: 'Epic',      width: 140, visible: true },
  { id: 'estimate', label: 'Estimate',  width: 80,  visible: true },
  { id: 'created',  label: 'Created',   width: 120, visible: true },
  { id: 'status',   label: 'Status',    width: 130, visible: true },
  { id: 'priority', label: 'Priority',  width: 80,  visible: true },
  { id: 'in_status',label: 'In Status', width: 120, visible: true },
]

type SortKey = 'id' | 'title' | 'project' | 'epic' | 'estimate' | 'created' | 'status' | 'priority' | 'in_status'
type SortDir = 'asc' | 'desc'

const SORTABLE_COLS = new Set<string>(['id', 'title', 'project', 'epic', 'estimate', 'created', 'status', 'priority', 'in_status'])

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-ghost/40">↕</span>
  return <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

function SaveViewModal({ filters, onClose }: { filters: ViewFilters; onClose: () => void }) {
  const [name, setName] = useState('')
  const create = useCreateView()

  function handleSave() {
    if (!name.trim()) return
    create.mutate({ name: name.trim(), filters }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-raised border border-line rounded-[var(--c-radius-card)] p-5 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm font-semibold text-ink mb-3">Save this view</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="View name…"
          className="w-full px-3 py-2 text-sm bg-canvas border border-line rounded-[var(--c-radius-card)] text-ink placeholder:text-ghost focus:outline-none focus:border-accent/60 mb-3"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-ink">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || create.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export function ItemsView() {
  const { selectItem } = useBoard()
  const [searchParams, setSearchParams] = useSearchParams()

  // Filters live in URL params so links are shareable and sidebar can load them.
  const projectFilter = searchParams.get('project_id') ?? 'all'
  const epicFilter    = searchParams.get('epic_id')    ?? 'all'
  const statusFilter  = searchParams.get('status_id')  ?? 'all'
  const priorityFilter = searchParams.get('priority')  ?? 'all'
  const hideDone      = searchParams.get('hide_done')  === 'true'

  const setFilter = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      if (!value || value === 'all') {
        prev.delete(key)
      } else {
        prev.set(key, value)
      }
      prev.delete('view') // unlink from saved view when filters change manually
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const toggleHideDone = useCallback(() => {
    setSearchParams((prev) => {
      if (prev.get('hide_done') === 'true') {
        prev.delete('hide_done')
      } else {
        prev.set('hide_done', 'true')
      }
      prev.delete('view')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const clearFilters = useCallback(() => {
    setSearchParams((prev) => {
      prev.delete('project_id')
      prev.delete('epic_id')
      prev.delete('status_id')
      prev.delete('priority')
      prev.delete('hide_done')
      prev.delete('view')
      return prev
    }, { replace: true })
  }, [setSearchParams])

  const { data: items = [] } = useItems()
  const { data: statuses = [] } = useBoardStatuses()
  const { data: epicList = [] } = useEpics()
  const { data: projectList = [] } = useProjects()
  const [search, setSearch] = useState('')
  const [columns, setColumns] = usePersistentState<ColumnConfig[]>('cumin:items:columns', DEFAULT_COLUMNS)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null)
  const [showColumnConfig, setShowColumnConfig] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:items:sortKey', 'created')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:items:sortDir', 'desc')

  const middleStatuses = useMemo(() => statuses.filter((s) => !s.is_initial && !s.is_done), [statuses])

  const projectOptions = useMemo(() => [
    { value: 'all', label: 'Project' },
    ...projectList.map((p) => ({ value: p.id, label: p.name, color: p.color })),
  ], [projectList])

  const epicOptions = useMemo(() => [
    { value: 'all', label: 'Epic' },
    ...epicList.map((e) => ({ value: e.id, label: e.name, color: e.color })),
  ], [epicList])

  const statusOptions = useMemo(() => [
    { value: 'all', label: 'Status' },
    ...statuses.map((s) => {
      const color = s.is_initial ? '#71717a' : s.is_done ? '#22c55e' : MIDDLE_COLORS[middleStatuses.indexOf(s) % MIDDLE_COLORS.length]
      return { value: s.id, label: s.name, color }
    }),
  ], [statuses, middleStatuses])

  const priorityOptions = useMemo(() => [
    { value: 'all', label: 'Priority' },
    ...([0, 1, 2, 3, 4] as const).map((p) => ({ value: String(p), label: PRIORITY[p].label, color: PRIORITY[p].color })),
  ], [])

  // Client-side filter: server already filters by project/epic/status/priority when
  // called with query params (via /api/items?project_id=X etc). We do it client-side
  // here too so the view stays fast on TanStack cache hits without a server round-trip.
  const filtered = useMemo(() => items.filter((item) => {
    if (projectFilter !== 'all' && item.project_id !== projectFilter) return false
    if (epicFilter    !== 'all' && item.epic_id    !== epicFilter)    return false
    if (statusFilter  !== 'all' && item.status_id  !== statusFilter)  return false
    if (priorityFilter !== 'all' && item.priority !== Number(priorityFilter)) return false
    if (hideDone) {
      const s = statuses.find((st) => st.id === item.status_id)
      if (s?.is_done) return false
    }
    if (search) {
      const q = search.toLowerCase()
      if (!item.title.toLowerCase().includes(q) && !item.display_id.toLowerCase().includes(q) && !(item.epic_name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  }), [items, projectFilter, epicFilter, statusFilter, priorityFilter, hideDone, search, statuses])

  function sortValue(item: Item, key: SortKey): string | number {
    switch (key) {
      case 'id':        return item.display_id
      case 'title':     return item.title.toLowerCase()
      case 'project':   return projectList.find((p) => p.id === item.project_id)?.name ?? ''
      case 'epic':      return item.epic_name ?? ''
      case 'estimate':  return item.estimate_minutes ?? 0
      case 'created':   return item.created_at?.toString() ?? ''
      case 'status':    return statuses.find((s) => s.id === item.status_id)?.name ?? ''
      case 'priority':  return item.priority
      case 'in_status': return item.time_in_status_minutes ?? 0
      default:          return 0
    }
  }

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtered, sortKey, sortDir])

  function handleSort(colId: string) {
    if (!SORTABLE_COLS.has(colId)) return
    const key = colId as SortKey
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function handleMouseDown(colId: string, e: React.MouseEvent) {
    e.preventDefault()
    const col = columns.find((c) => c.id === colId)!
    const startX = e.clientX
    const startWidth = col.width
    setResizing({ id: colId, startX, startWidth })

    const handleMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX
      setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, width: Math.max(60, startWidth + diff) } : c))
    }
    const handleUp = () => {
      setResizing(null)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  function renderCell(col: ColumnConfig, item: Item) {
    const priority = PRIORITY[item.priority] ?? PRIORITY[4]
    const status = statuses.find((s) => s.id === item.status_id)
    const project = projectList.find((p) => p.id === item.project_id)

    switch (col.id) {
      case 'id':
        return <span className="text-sm font-mono font-medium text-accent">{item.display_id}</span>
      case 'title':
        return <span className="text-sm font-medium text-ink">{item.title}</span>
      case 'project':
        return project
          ? <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: (project.color ?? '#6b7280') + '18', color: project.color ?? '#6b7280', border: `1px solid ${(project.color ?? '#6b7280')}25` }}>{project.prefix}</span>
          : <span className="text-ghost text-xs">—</span>
      case 'epic':
        return item.epic_name
          ? <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: (item.epic_color ?? '#6b7280') + '18', color: item.epic_color ?? '#6b7280', border: `1px solid ${(item.epic_color ?? '#6b7280')}25` }}>{item.epic_name}</span>
          : <span className="text-ghost text-xs">—</span>
      case 'estimate':
        return <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
      case 'created':
        return <span className="text-xs text-dim">{item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</span>
      case 'status':
        return (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            status?.is_done ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-line text-ink/80'
          }`}>
            {status?.name}
          </span>
        )
      case 'priority':
        return <span className="text-sm font-bold" style={{ color: priority.color }}>{priority.label}</span>
      case 'in_status':
        return <div className="w-full"><StatusDurationBar minutes={item.time_in_status_minutes} estimateMinutes={item.estimate_minutes} /></div>
      default:
        return null
    }
  }

  const visibleCols = columns.filter((c) => c.visible)
  const activeFilterCount = [projectFilter, epicFilter, statusFilter, priorityFilter].filter((v) => v !== 'all').length + (hideDone ? 1 : 0)

  const currentFilters: ViewFilters = {
    ...(projectFilter !== 'all' && { project_id: projectFilter }),
    ...(epicFilter    !== 'all' && { epic_id:    epicFilter }),
    ...(statusFilter  !== 'all' && { status_id:  statusFilter }),
    ...(priorityFilter !== 'all' && { priority:  Number(priorityFilter) }),
    ...(hideDone && { hide_done: true }),
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} />}
      {showSaveModal && <SaveViewModal filters={currentFilters} onClose={() => setShowSaveModal(false)} />}

      <div className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center gap-2 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search items…" className="min-w-[140px] flex-1 sm:flex-none sm:w-48" />
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect value={projectFilter} onChange={(v) => setFilter('project_id', v)} options={projectOptions} />
          <FilterSelect value={epicFilter}    onChange={(v) => setFilter('epic_id', v)}    options={epicOptions} />
          <FilterSelect value={statusFilter}  onChange={(v) => setFilter('status_id', v)}  options={statusOptions} />
          <FilterSelect value={priorityFilter} onChange={(v) => setFilter('priority', v)}  options={priorityOptions} />
          <button
            onClick={toggleHideDone}
            className={`text-xs px-2 py-1 rounded-[var(--c-radius-card)] transition-colors ${
              hideDone ? 'bg-accent/10 text-accent' : 'text-ghost hover:text-dim hover:bg-line'
            }`}
          >
            Hide done
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-accent hover:bg-accent/10">
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ghost hidden sm:inline">{filtered.length} items</span>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setShowSaveModal(true)}
              className="text-xs px-2.5 py-1 rounded-[var(--c-radius-card)] border border-line text-dim hover:text-ink hover:border-accent/40 transition-colors"
              title="Save this filter combination as a view"
            >
              Save view
            </button>
          )}
          <button
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className="p-1.5 rounded-[var(--c-radius-card)] text-sm text-dim hover:bg-line"
            title="Configure columns"
          >
            ⚙
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            <span>+</span>
            <span className="hidden sm:inline">New item</span>
          </button>
        </div>
      </div>

      {showColumnConfig && (
        <div className="absolute right-4 top-24 z-30 rounded-[var(--c-radius-card)] shadow-lg border p-3 bg-raised border-line">
          <p className="text-xs font-semibold mb-2 text-ink/80">Columns</p>
          {columns.map((col) => (
            <label key={col.id} className="flex items-center gap-2 py-1 cursor-pointer text-sm text-ink/80">
              <input
                type="checkbox"
                checked={col.visible}
                onChange={() => setColumns((prev) => prev.map((c) => c.id === col.id ? { ...c, visible: !c.visible } : c))}
                className="rounded"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: visibleCols.reduce((s, c) => s + c.width, 0) }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-panel">
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  onClick={() => handleSort(col.id)}
                  className={`text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 relative select-none border-b text-dim border-line transition-colors ${SORTABLE_COLS.has(col.id) ? 'cursor-pointer hover:text-ink' : ''} ${sortKey === col.id ? 'text-ink' : ''}`}
                  style={{ width: col.width, minWidth: col.width }}
                >
                  {col.label}
                  {SORTABLE_COLS.has(col.id) && <SortIcon col={col.id} sortKey={sortKey} sortDir={sortDir} />}
                  <div
                    onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(col.id, e) }}
                    className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 ${resizing?.id === col.id ? 'bg-accent/40' : ''}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => (
              <tr
                key={item.id}
                onClick={() => selectItem(item)}
                className="cursor-pointer transition-colors border-b hover:bg-surface border-line"
              >
                {visibleCols.map((col) => (
                  <td
                    key={col.id}
                    className="px-4 py-2.5"
                    style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}
                  >
                    <div className="truncate">{renderCell(col, item)}</div>
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length} className="px-4 py-8 text-center text-sm text-ghost">
                  No items{activeFilterCount > 0 ? ' matching filters' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
