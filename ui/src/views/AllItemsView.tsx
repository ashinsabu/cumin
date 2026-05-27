import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
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
  const { isDark } = useTheme()
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
      if (!item.title.toLowerCase().includes(q) && !item.display_id.toLowerCase().includes(q) && !item.epic_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const visibleCols = columns.filter((c) => c.visible)

  function handleMouseDown(colId: string, e: React.MouseEvent) {
    e.preventDefault()
    const col = columns.find((c) => c.id === colId)!
    setResizing({ id: colId, startX: e.clientX, startWidth: col.width })

    const handleMove = (ev: MouseEvent) => {
      const diff = ev.clientX - e.clientX
      setColumns((prev) => prev.map((c) => c.id === colId ? { ...c, width: Math.max(60, col.width + diff) } : c))
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
        return <span className={`text-[12px] font-mono font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>{item.display_id}</span>
      case 'title':
        return <span className={`text-[12px] font-medium ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{item.title}</span>
      case 'epic':
        return <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}25` }}>{item.epic_name}</span>
      case 'estimate':
        return <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
      case 'created':
        return <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>26 May 2026, 10:00</span>
      case 'status':
        return (
          <span className={`text-[11px] font-semibold px-2 py-1 rounded ${
            status?.is_done
              ? 'bg-green-50 text-green-700 border border-green-200'
              : isDark ? 'bg-[#2e303a] text-gray-200' : 'bg-gray-100 text-gray-700'
          }`}>
            {status?.name}
          </span>
        )
      case 'priority':
        return <span className="text-[12px] font-bold" style={{ color: priority.color }}>{priority.label}</span>
      case 'in_status':
        return <div className="w-full"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
      default:
        return null
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className={`shrink-0 px-4 py-3 border-b flex items-center gap-3 ${isDark ? 'border-[#2e303a]' : 'border-gray-200'}`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <span className={`text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔍</span>
          <input
            type="text"
            placeholder="Search work..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`text-[12px] outline-none bg-transparent w-40 ${isDark ? 'text-gray-200 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
          />
        </div>

        <div className="flex items-center gap-2">
          <select value={filters.epic} onChange={(e) => setFilters((f) => ({ ...f, epic: e.target.value }))}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
            <option value="all">Epic</option>
            {epics.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
            <option value="all">Status</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
            <option value="all">Priority</option>
            <option value="0">P0</option><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option>
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => setFilters({ epic: 'all', priority: 'all', status: 'all' })}
              className={`text-[11px] px-2 py-1 rounded-md ${isDark ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`}
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} items</span>
          <button
            onClick={() => setShowColumnConfig(!showColumnConfig)}
            className={`p-1.5 rounded-md text-[12px] ${isDark ? 'text-gray-400 hover:bg-[#2e303a]' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Configure columns"
          >
            ⚙
          </button>
        </div>
      </div>

      {showColumnConfig && (
        <div className={`absolute right-4 top-24 z-30 rounded-lg shadow-lg border p-3 ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <p className={`text-[11px] font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Columns</p>
          {columns.map((col) => (
            <label key={col.id} className={`flex items-center gap-2 py-1 cursor-pointer text-[12px] ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
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
            <tr className={isDark ? 'bg-[#16171d]' : 'bg-gray-50'}>
              {visibleCols.map((col) => (
                <th
                  key={col.id}
                  className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 relative select-none border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`}
                  style={{ width: col.width, minWidth: col.width }}
                >
                  {col.label}
                  <div
                    onMouseDown={(e) => handleMouseDown(col.id, e)}
                    className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-400 ${resizing?.id === col.id ? 'bg-indigo-400' : ''}`}
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
                className={`cursor-pointer transition-colors border-b ${isDark ? 'hover:bg-[#1e1f25] border-[#2e303a]' : 'hover:bg-blue-50/40 border-gray-100'}`}
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
