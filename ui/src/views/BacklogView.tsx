import { useState } from 'react'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'

export function BacklogView() {
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
      <div className="shrink-0 px-4 py-3 border-b flex items-center gap-3 border-line">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--c-radius-card)] border bg-surface border-line">
          <span className="text-sm text-ghost">🔍</span>
          <input
            type="text"
            placeholder="Search backlog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm outline-none bg-transparent w-40 text-ink placeholder:text-ghost"
          />
        </div>

        <select value={filters.epic} onChange={(e) => setFilters((f) => ({ ...f, epic: e.target.value }))}
          className="text-xs px-2.5 py-1.5 rounded-[var(--c-radius-card)] border outline-none bg-surface border-line text-ink">
          <option value="all">Epic</option>
          {epics.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
          className="text-xs px-2.5 py-1.5 rounded-[var(--c-radius-card)] border outline-none bg-surface border-line text-ink">
          <option value="all">Priority</option>
          <option value="0">P0</option><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option>
        </select>

        {activeFilters > 0 && (
          <button onClick={() => setFilters({ epic: 'all', priority: 'all' })}
            className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-accent hover:bg-accent/10">
            Clear ({activeFilters})
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ghost">
            {filtered.length} items · {formatEstimate(totalEstimate)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 800 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-panel">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 90 }}>ID</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line">Work</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 130 }}>Epic</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 80 }}>Estimate</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 80 }}>Priority</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 120 }}>Waiting</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const priority = PRIORITY[item.priority]
              return (
                <tr
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className="cursor-pointer transition-colors border-b hover:bg-surface border-line"
                >
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-mono font-medium text-accent">{item.display_id}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-medium text-ink">{item.title}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: item.epic_color + '18', color: item.epic_color, border: `1px solid ${item.epic_color}25` }}>{item.epic_name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-bold" style={{ color: priority.color }}>{priority.label}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="w-full"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-ghost">
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
