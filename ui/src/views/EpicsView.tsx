import { useMemo } from 'react'
import { useBoard } from '../context/BoardContext'
import { useItems } from '../hooks/useItems'
import { useEpics } from '../hooks/useEpics'
import { useBoardStatuses } from '../hooks/useBoardQueries'
import { formatEstimate } from '../hooks/useFormat'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'
import { EpicModal } from '../components/EpicModal'
import { CreateEpicModal } from '../components/CreateEpicModal'
import { usePersistentState } from '../hooks/usePersistentState'
import { SortIcon, ViewModeToggle, PageToolbar } from '../components/ui'
import type { Epic } from '../types'

type SortKey = 'name' | 'type' | 'items' | 'estimate' | 'progress' | 'deadline'
type SortDir = 'asc' | 'desc'
type ViewMode = 'list' | 'grid'

const TYPE_STYLES: Record<string, string> = {
  recurring: 'bg-green-500/10 text-green-400 border border-green-500/20',
  goal:      'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  catchall:  'bg-line text-dim border border-line',
}

export function EpicsView() {
  const { selectEpic, selectedEpic } = useBoard()
  const { data: items = [] } = useItems()
  const { data: statuses = [] } = useBoardStatuses()
  const { data: epics = [] } = useEpics()
  const [search, setSearch] = usePersistentState('cumin:epics:search', '')
  const [typeFilter, setTypeFilter] = usePersistentState('cumin:epics:typeFilter', 'all')
  const [sortKey, setSortKey] = usePersistentState<SortKey>('cumin:epics:sortKey', 'name')
  const [sortDir, setSortDir] = usePersistentState<SortDir>('cumin:epics:sortDir', 'asc')
  const [viewMode, setViewMode] = usePersistentState<ViewMode>('cumin:epics:viewMode', 'list')
  const [showCreate, setShowCreate] = usePersistentState('cumin:epics:showCreate', false)

  // Computed epic stats
  const epicStats = useMemo(() => {
    return epics.map((epic) => {
      const epicItems = items.filter((i) => i.epic_id === epic.id)
      const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
      const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
      const doneEstimate = doneItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
      const progress = totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0
      const daysLeft = epic.deadline ? Math.ceil((new Date(epic.deadline).getTime() - Date.now()) / 86400000) : null
      return { epic, epicItems, doneItems, totalEstimate, progress, daysLeft }
    })
  }, [epics, items, statuses])

  const filtered = useMemo(() => {
    return epicStats.filter(({ epic }) => {
      if (typeFilter !== 'all' && epic.type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!epic.name.toLowerCase().includes(q) && !(epic.description ?? '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [epicStats, typeFilter, search])

  function sortValue(row: typeof filtered[0], key: SortKey): string | number {
    switch (key) {
      case 'name':     return row.epic.name.toLowerCase()
      case 'type':     return row.epic.type
      case 'items':    return row.epicItems.length
      case 'estimate': return row.totalEstimate
      case 'progress': return row.progress
      case 'deadline': return row.epic.deadline ?? '9999'
      default:         return 0
    }
  }

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  }), [filtered, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function thClass(key: SortKey) {
    return `text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line cursor-pointer select-none hover:text-ink transition-colors ${sortKey === key ? 'text-ink' : ''}`
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCreate && <CreateEpicModal onClose={() => setShowCreate(false)} />}
      {selectedEpic && <EpicModal epic={selectedEpic} onClose={() => selectEpic(null)} />}

      <PageToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search epics…" />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all',       label: 'Type' },
            { value: 'goal',      label: 'Goal',      color: '#a855f7' },
            { value: 'recurring', label: 'Recurring', color: '#22c55e' },
            { value: 'catchall',  label: 'Catch-all', color: '#71717a' },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ghost">{filtered.length} epics</span>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            + New Epic
          </button>
        </div>
      </PageToolbar>

      <div className="flex-1 overflow-auto">
        {viewMode === 'list' ? (
          <table className="w-full border-collapse" style={{ minWidth: 700 }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-panel">
                <th className={thClass('name')} style={{ width: 260 }} onClick={() => handleSort('name')}>
                  Epic<SortIcon active={sortKey === 'name'} dir={sortDir} />
                </th>
                <th className={thClass('type')} style={{ width: 100 }} onClick={() => handleSort('type')}>
                  Type<SortIcon active={sortKey === 'type'} dir={sortDir} />
                </th>
                <th className={thClass('items')} style={{ width: 100 }} onClick={() => handleSort('items')}>
                  Items<SortIcon active={sortKey === 'items'} dir={sortDir} />
                </th>
                <th className={thClass('estimate')} style={{ width: 100 }} onClick={() => handleSort('estimate')}>
                  Estimate<SortIcon active={sortKey === 'estimate'} dir={sortDir} />
                </th>
                <th className={thClass('deadline')} style={{ width: 100 }} onClick={() => handleSort('deadline')}>
                  Deadline<SortIcon active={sortKey === 'deadline'} dir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ epic, epicItems, doneItems, totalEstimate, progress, daysLeft }) => (
                <tr
                  key={epic.id}
                  onClick={() => selectEpic(epic)}
                  className="cursor-pointer transition-colors border-b hover:bg-surface border-line"
                >
                  <td className="px-4 py-4 border-l-4" style={{ borderLeftColor: epic.color }}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-semibold text-ink">{epic.name}</span>
                    </div>
                    <div className="mt-1.5 h-1 rounded-full bg-line overflow-hidden w-28">
                      <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${TYPE_STYLES[epic.type] ?? TYPE_STYLES.catchall}`}>{epic.type}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-medium text-ink">{doneItems.length}<span className="text-ghost">/{epicItems.length}</span></span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-semibold text-ink/80">{totalEstimate ? formatEstimate(totalEstimate) : '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <DeadlineChip daysLeft={daysLeft} />
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ghost">No epics found.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map(({ epic, epicItems, doneItems, totalEstimate, progress, daysLeft }) => (
              <EpicCard
                key={epic.id}
                epic={epic}
                epicItems={epicItems.length}
                doneItems={doneItems.length}
                totalEstimate={totalEstimate}
                progress={progress}
                daysLeft={daysLeft}
                onClick={() => selectEpic(epic)}
              />
            ))}
            {sorted.length === 0 && (
              <p className="col-span-full text-center text-sm text-ghost py-8">No epics found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DeadlineChip({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <span className="text-xs text-ghost">—</span>
  return (
    <span className={`text-xs font-medium ${daysLeft <= 0 ? 'text-red-500' : daysLeft < 7 ? 'text-amber-500' : 'text-ink/80'}`}>
      {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d left`}
    </span>
  )
}

function EpicCard({ epic, epicItems, doneItems, totalEstimate, progress, daysLeft, onClick }: {
  epic: Epic; epicItems: number; doneItems: number
  totalEstimate: number; progress: number; daysLeft: number | null
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-[var(--c-radius-card)] border border-line bg-surface hover:bg-raised transition-colors p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
          <span className="text-sm font-semibold text-ink truncate">{epic.name}</span>
        </div>
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${TYPE_STYLES[epic.type] ?? TYPE_STYLES.catchall}`}>{epic.type}</span>
      </div>
      {epic.description && <p className="text-xs text-dim line-clamp-2">{epic.description}</p>}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-ghost">
          <span>{doneItems}/{epicItems} items</span>
          <span className="font-semibold text-ink">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-line">
          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-ghost">
        <span>{totalEstimate ? formatEstimate(totalEstimate) : '—'}</span>
        <DeadlineChip daysLeft={daysLeft} />
      </div>
    </div>
  )
}
