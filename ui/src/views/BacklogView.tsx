import { useState } from 'react'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'
import { CreateItemModal } from '../components/CreateItemModal'

export function BacklogView() {
  const { items, statuses, selectItem } = useBoard()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<{ epic: string; priority: string }>({ epic: 'all', priority: 'all' })
  const [showCreate, setShowCreate] = useState(false)

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
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} />}
      <div className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center gap-2 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search backlog…" className="min-w-[140px] flex-1 sm:flex-none sm:w-48" />
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect
            value={filters.epic}
            onChange={(v) => setFilters((f) => ({ ...f, epic: v }))}
            options={[{ value: 'all', label: 'Epic' }, ...epics.filter(Boolean).map((e) => ({ value: e!, label: e! }))]}
          />
          <FilterSelect
            value={filters.priority}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
            options={[{ value: 'all', label: 'Priority' }, { value: '0', label: 'P0' }, { value: '1', label: 'P1' }, { value: '2', label: 'P2' }, { value: '3', label: 'P3' }, { value: '4', label: 'P4' }]}
          />
          {activeFilters > 0 && (
            <button onClick={() => setFilters({ epic: 'all', priority: 'all' })}
              className="text-xs px-2 py-1 rounded-[var(--c-radius-card)] text-accent hover:bg-accent/10">
              Clear ({activeFilters})
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ghost hidden sm:inline">
            {filtered.length} items · {formatEstimate(totalEstimate)}
          </span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent text-white hover:opacity-90"
          >
            <span>+</span>
            <span className="hidden sm:inline">New item</span>
          </button>
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
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 120 }}>Status</th>
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
                    {(() => { const s = statuses.find(st => st.id === item.status_id); return s ? <span className="text-xs font-semibold px-2 py-0.5 rounded-[var(--c-radius-badge)] bg-line text-ink/80">{s.name}</span> : <span className="text-ghost">—</span> })()}
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
