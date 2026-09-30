import { useState } from 'react'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'
import type { Item } from '../types'

type ColumnConfig = {
  id: string
  label: string
  width: number
  visible: boolean
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'id', label: 'ID', width: 90, visible: true },
  { id: 'title', label: 'Work', width: 280, visible: true },
  { id: 'epic', label: 'Epic', width: 140, visible: true },
  { id: 'estimate', label: 'Estimate', width: 80, visible: true },
  { id: 'created', label: 'Created', width: 140, visible: true },
  { id: 'status', label: 'Status', width: 130, visible: true },
  { id: 'priority', label: 'Priority', width: 80, visible: true },
  { id: 'in_status', label: 'In Status', width: 120, visible: true },
]

export function AllItemsView() {
  const { items, statuses, selectItem } = useBoard()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<{ epic: string; priority: string; status: string }>({ epic: 'all', priority: 'all', status: 'all' })
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [resizing, setResizing] = useState<{ id: string; startX: number; startWidth: number } | null>(null)
  const [showColumnConfig, setShowColumnConfig] = useState(false)

  const epics = [...new Set(items.map((i) => i.epic_name))]
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
    const priority = PRIORITY[item.priority]
    const status = statuses.find((s) => s.id === item.status_id)

    switch (col.id) {
      case 'id':
        return <span className="text-sm font-mono font-medium text-accent">{item.display_id}</span>
      case 'title':
        return <span className="text-sm font-medium text-ink">{item.title}</span>
      case 'epic':
        return <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}25` }}>{item.epic_name}</span>
      case 'estimate':
        return <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
      case 'created':
        return <span className="text-xs text-dim">26 May 2026, 10:00</span>
      case 'status':
        return (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            status?.is_done
              ? 'bg-green-50 text-green-700 border border-green-200'
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
      <div className="shrink-0 px-4 py-3 border-b flex items-center gap-3 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search work…" />
        <FilterSelect
          value={filters.epic}
          onChange={(v) => setFilters((f) => ({ ...f, epic: v }))}
          options={[{ value: 'all', label: 'Epic' }, ...epics.filter(Boolean).map((e) => ({ value: e!, label: e! }))]}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[{ value: 'all', label: 'Status' }, ...statuses.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <FilterSelect
          value={filters.priority}
          onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
          options={[{ value: 'all', label: 'Priority' }, { value: '0', label: 'P0' }, { value: '1', label: 'P1' }, { value: '2', label: 'P2' }, { value: '3', label: 'P3' }, { value: '4', label: 'P4' }]}
        />
        {activeFilters > 0 && (
          <button
            onClick={() => setFilters({ epic: 'all', priority: 'all', status: 'all' })}
            className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-accent hover:bg-accent/10"
          >
            Clear ({activeFilters})
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ghost">{filtered.length} items</span>
          <button
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className="p-1.5 rounded-[var(--c-radius-card)] text-sm text-dim hover:bg-line"
            title="Configure columns"
          >
            ⚙
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
                  className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 relative select-none border-b text-dim border-line"
                  style={{ width: col.width, minWidth: col.width }}
                >
                  {col.label}
                  <div
                    onMouseDown={(e) => handleMouseDown(col.id, e)}
                    className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/40 ${resizing?.id === col.id ? 'bg-accent/40' : ''}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
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
          </tbody>
        </table>
      </div>
    </div>
  )
}
