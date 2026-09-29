import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import type { Item } from '../types'

export function BacklogView() {
  const { isDark } = useTheme()
  const { items, statuses, selectItem } = useBoard()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<{ epic: string; priority: string }>({ epic: 'all', priority: 'all' })

  const backlogItems = items
    .filter((i) => !statuses.find((s) => s.id === i.status_id)?.is_done)
    .sort((a, b) => a.priority - b.priority)

  const epics = [...new Set(backlogItems.map((i) => i.epic_name))]

  const filtered = backlogItems.filter((item) => {
    if (filters.epic !== 'all' && item.epic_name !== filters.epic) return false
    if (filters.priority !== 'all' && item.priority !== Number(filters.priority)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.title.toLowerCase().includes(q) && !item.display_id.toLowerCase().includes(q)) return false
    }
    return true
  })

  const activeFilters = Object.values(filters).filter((v) => v !== 'all').length
  const totalEstimate = filtered.reduce((s, i) => s + (i.estimate_minutes || 0), 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className={`shrink-0 px-4 py-3 border-b flex items-center gap-3 ${isDark ? 'border-[#2e303a]' : 'border-gray-200'}`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <span className={`text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔍</span>
          <input
            type="text"
            placeholder="Search backlog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`text-[12px] outline-none bg-transparent w-40 ${isDark ? 'text-gray-200 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
          />
        </div>

        <select value={filters.epic} onChange={(e) => setFilters((f) => ({ ...f, epic: e.target.value }))}
          className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
          <option value="all">Epic</option>
          {epics.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
          <option value="all">Priority</option>
          <option value="0">P0</option><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option>
        </select>

        {activeFilters > 0 && (
          <button onClick={() => setFilters({ epic: 'all', priority: 'all' })}
            className={`text-[11px] px-2 py-1 rounded-md ${isDark ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`}>
            Clear ({activeFilters})
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {filtered.length} items · {formatEstimate(totalEstimate)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 800 }}>
          <thead className="sticky top-0 z-10">
            <tr className={isDark ? 'bg-[#16171d]' : 'bg-gray-50'}>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 90 }}>ID</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`}>Work</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 130 }}>Epic</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 80 }}>Estimate</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 80 }}>Priority</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 120 }}>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const priority = PRIORITY[item.priority]
              return (
                <tr
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`cursor-pointer transition-colors border-b ${isDark ? 'hover:bg-[#1e1f25] border-[#2e303a]' : 'hover:bg-blue-50/40 border-gray-100'}`}
                >
                  <td className="px-4 py-2.5">
                    <span className={`text-[12px] font-mono font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>{item.display_id}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[12px] font-medium ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{item.title}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}25` }}>{item.epic_name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[12px] font-bold" style={{ color: priority.color }}>{priority.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="w-full"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No backlog items{activeFilters > 0 ? ' matching filters' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
