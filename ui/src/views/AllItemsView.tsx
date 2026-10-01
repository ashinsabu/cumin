import { useState, useMemo } from 'react'
import { useBoard } from '../context/BoardContext'
import { usePersistentState } from '../hooks/usePersistentState'
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
  { id: 'title',    label: 'Work',      width: 280, visible: true },
  { id: 'epic',     label: 'Epic',      width: 140, visible: true },
  { id: 'estimate', label: 'Estimate',  width: 80,  visible: true },
  { id: 'created',  label: 'Created',   width: 140, visible: true },
  { id: 'status',   label: 'Status',    width: 130, visible: true },
  { id: 'priority', label: 'Priority',  width: 80,  visible: true },
  { id: 'in_status',label: 'In Status', width: 120, visible: true },
]

type SortKey = 'id' | 'title' | 'epic' | 'estimate' | 'created' | 'status' | 'priority' | 'in_status'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: string; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-ghost/40">↕</span>
  return <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

const SORTABLE_COLS = new Set(['id', 'title', 'epic', 'estimate', 'created', 'status', 'priority', 'in_status'])

export function AllItemsView() {
  const { items, statuses, epics: epicList, selectItem } = useBoard()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = usePersistentState<{ epic: string; priority: string; status: string }>('cumin:items:filters', { epic: 'all', priority: 'all', status: 'all' })

  const middleStatuses = useMemo(() => statuses.filter(s => !s.is_initial && !s.is_done), [statuses])

  const epicOptions = useMemo(() => [
    { value: 'all', label: 'Epic' },
    ...epicList.map((e) => ({ value: e.name, label: e.name, color: e.color })),
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
  const [columns, setColumns] = usePersistentState<ColumnConfig[]>('cumin:items:columns', DEFAULT_COLUMNS)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null)
  const [showColumnConfig, setShowColumnConfig] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:items:sortKey', 'created')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:items:sortDir', 'desc')

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== 'all').length

  const filtered = items.filter((item) => {
    if (filters.epic !== 'all' && item.epic_name !== filters.epic) return false
    if (filters.priority !== 'all' && item.priority !== Number(filters.priority)) return false
    if (filters.status !== 'all' && item.status_id !== filters.status) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.title.toLowerCase().includes(q) && !item.display_id.toLowerCase().includes(q) && !(item.epic_name ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function sortValue(item: Item, key: SortKey): string | number {
    switch (key) {
      case 'id':        return item.display_id
      case 'title':     return item.title.toLowerCase()
      case 'epic':      return item.epic_name ?? ''
      case 'estimate':  return item.estimate_minutes ?? 0
      case 'created':   return item.created_at ?? ''
      case 'status':    return statuses.find((s) => s.id === item.status_id)?.name ?? ''
      case 'priority':  return item.priority
      case 'in_status': return item.time_in_status_minutes ?? 0
      default:          return 0
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

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

  const visibleCols = columns.filter((c) => c.visible)

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

    switch (col.id) {
      case 'id':
        return <span className="text-sm font-mono font-medium text-accent">{item.display_id}</span>
      case 'title':
        return <span className="text-sm font-medium text-ink">{item.title}</span>
      case 'epic':
        return item.epic_name
          ? <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: (item.epic_color ?? '#6b7280') + '18', color: item.epic_color ?? '#6b7280', border: `1px solid ${item.epic_color ?? '#6b7280'}25` }}>{item.epic_name}</span>
          : <span className="text-ghost text-xs">—</span>
      case 'estimate':
        return <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
      case 'created':
        return <span className="text-xs text-dim">{item.created_at ? new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
      case 'status':
        return (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            status?.is_done
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-line text-ink/80'
          }`}>
            {status?.name}
          </span>
        )
      case 'priority':
        return <span className="text-sm font-bold" style={{ color: priority.color }}>{priority.label}</span>
      case 'in_status':
        return <div className="w-full"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} />}
      <div className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center gap-2 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search work…" className="min-w-[140px] flex-1 sm:flex-none sm:w-48" />
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect value={filters.epic} onChange={(v) => setFilters((f) => ({ ...f, epic: v }))} options={epicOptions} />
          <FilterSelect value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={statusOptions} />
          <FilterSelect value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} options={priorityOptions} />
          {activeFilters > 0 && (
            <button
              onClick={() => setFilters({ epic: 'all', priority: 'all', status: 'all' })}
              className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-accent hover:bg-accent/10"
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ghost hidden sm:inline">{filtered.length} items</span>
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
                  No items{activeFilters > 0 ? ' matching filters' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
