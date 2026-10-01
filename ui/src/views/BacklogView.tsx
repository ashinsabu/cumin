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

type SortKey = 'id' | 'title' | 'epic' | 'estimate' | 'status' | 'priority' | 'waiting'
type SortDir = 'asc' | 'desc'

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-ghost/40">↕</span>
  return <span className="ml-1 text-accent">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export function BacklogView() {
  const { items, statuses, epics: epicList, selectItem } = useBoard()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = usePersistentState<{ epic: string; priority: string }>('cumin:backlog:filters', { epic: 'all', priority: 'all' })
  const [showCreate, setShowCreate] = useState(false)
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:backlog:sortKey', 'priority')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:backlog:sortDir', 'asc')

  const epicOptions = useMemo(() => [
    { value: 'all', label: 'Epic' },
    ...epicList.map((e) => ({ value: e.name, label: e.name, color: e.color })),
  ], [epicList])

  const priorityOptions = useMemo(() => [
    { value: 'all', label: 'Priority' },
    ...([0, 1, 2, 3, 4] as const).map((p) => ({ value: String(p), label: PRIORITY[p].label, color: PRIORITY[p].color })),
  ], [])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function thClass(key: SortKey) {
    return `text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line cursor-pointer select-none hover:text-ink transition-colors ${sortKey === key ? 'text-ink' : ''}`
  }

  const backlogItems = items.filter((i) => !statuses.find((s) => s.id === i.status_id)?.is_done)

  const filtered = backlogItems.filter((item) => {
    if (filters.epic !== 'all' && item.epic_name !== filters.epic) return false
    if (filters.priority !== 'all' && item.priority !== Number(filters.priority)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.title.toLowerCase().includes(q) && !item.display_id.toLowerCase().includes(q)) return false
    }
    return true
  })

  function sortValue(item: Item, key: SortKey): string | number {
    switch (key) {
      case 'id': return item.display_id
      case 'title': return item.title.toLowerCase()
      case 'epic': return item.epic_name ?? ''
      case 'estimate': return item.estimate_minutes ?? 0
      case 'status': return statuses.find((s) => s.id === item.status_id)?.name ?? ''
      case 'priority': return item.priority
      case 'waiting': return item.time_in_status_minutes ?? 0
      default: return 0
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const activeFilters = Object.values(filters).filter((v) => v !== 'all').length
  const totalEstimate = filtered.reduce((s, i) => s + (i.estimate_minutes || 0), 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCreate && <CreateItemModal onClose={() => setShowCreate(false)} />}
      <div className="shrink-0 px-4 py-3 border-b flex flex-wrap items-center gap-2 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search backlog…" className="min-w-[140px] flex-1 sm:flex-none sm:w-48" />
        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect value={filters.epic} onChange={(v) => setFilters((f) => ({ ...f, epic: v }))} options={epicOptions} />
          <FilterSelect value={filters.priority} onChange={(v) => setFilters((f) => ({ ...f, priority: v }))} options={priorityOptions} />
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
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
              <th className={thClass('id')} style={{ width: 90 }} onClick={() => handleSort('id')}>
                ID<SortIcon col="id" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('title')} onClick={() => handleSort('title')}>
                Work<SortIcon col="title" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('epic')} style={{ width: 130 }} onClick={() => handleSort('epic')}>
                Epic<SortIcon col="epic" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('estimate')} style={{ width: 80 }} onClick={() => handleSort('estimate')}>
                Estimate<SortIcon col="estimate" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('status')} style={{ width: 120 }} onClick={() => handleSort('status')}>
                Status<SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('priority')} style={{ width: 80 }} onClick={() => handleSort('priority')}>
                Priority<SortIcon col="priority" sortKey={sortKey} sortDir={sortDir} />
              </th>
              <th className={thClass('waiting')} style={{ width: 120 }} onClick={() => handleSort('waiting')}>
                Waiting<SortIcon col="waiting" sortKey={sortKey} sortDir={sortDir} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const priority = PRIORITY[item.priority] ?? PRIORITY[4]
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
                    {item.epic_name
                      ? <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ backgroundColor: (item.epic_color ?? '#6b7280') + '18', color: item.epic_color ?? '#6b7280', border: `1px solid ${item.epic_color ?? '#6b7280'}25` }}>{item.epic_name}</span>
                      : <span className="text-ghost text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-semibold text-ink/80">{item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {(() => {
                      const s = statuses.find((st) => st.id === item.status_id)
                      return s
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-[var(--c-radius-badge)] bg-line text-ink/80">{s.name}</span>
                        : <span className="text-ghost">—</span>
                    })()}
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
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-ghost">
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
