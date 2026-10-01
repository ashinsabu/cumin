import { useBoard } from '../context/BoardContext'
import { formatEstimate } from '../hooks/useFormat'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'
import { EpicModal } from '../components/EpicModal'
import { CreateEpicModal } from '../components/CreateEpicModal'
import { useState } from 'react'

const TYPE_STYLES: Record<string, string> = {
  recurring: 'bg-green-500/10 text-green-400 border border-green-500/20',
  goal:      'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  catchall:  'bg-line text-dim border border-line',
}

export function EpicsView() {
  const { items, statuses, epics, selectEpic, selectedEpic } = useBoard()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)

  const filtered = epics.filter((epic) => {
    if (typeFilter !== 'all' && epic.type !== typeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!epic.name.toLowerCase().includes(q) && !(epic.description ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showCreate && <CreateEpicModal onClose={() => setShowCreate(false)} />}
      {selectedEpic && <EpicModal epic={selectedEpic} onClose={() => selectEpic(null)} />}

      <div className="shrink-0 px-4 py-3 border-b flex items-center gap-3 border-line">
        <SearchInput value={search} onChange={setSearch} placeholder="Search epics…" />
        <FilterSelect
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'Type' },
            { value: 'goal', label: 'Goal' },
            { value: 'recurring', label: 'Recurring' },
            { value: 'catchall', label: 'Catch-all' },
          ]}
        />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ghost">{filtered.length} epics</span>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-[var(--c-radius-card)] bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            + New Epic
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 700 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-panel">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 260 }}>Epic</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Type</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Items</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Estimate</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 160 }}>Progress</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((epic) => {
              const epicItems = items.filter((i) => i.epic_id === epic.id)
              const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
              const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
              const doneEstimate = doneItems.reduce((s, i) => s + (i.estimate_minutes ?? 0), 0)
              const progress = totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0
              const daysLeft = epic.deadline ? Math.ceil((new Date(epic.deadline).getTime() - Date.now()) / 86400000) : null

              return (
                <tr
                  key={epic.id}
                  onClick={() => selectEpic(epic)}
                  className="cursor-pointer transition-colors border-b hover:bg-surface border-line"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
                      <span className="text-sm font-semibold text-ink">{epic.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${TYPE_STYLES[epic.type] ?? TYPE_STYLES.catchall}`}>
                      {epic.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-ink">{doneItems.length}<span className="text-ghost">/{epicItems.length}</span></span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-ink/80">{totalEstimate ? formatEstimate(totalEstimate) : '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-line">
                        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
                      </div>
                      <span className="text-xs font-semibold shrink-0 w-8 text-right text-dim">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {daysLeft !== null ? (
                      <span className={`text-xs font-medium ${daysLeft <= 0 ? 'text-red-500' : daysLeft < 7 ? 'text-amber-500' : 'text-ink/80'}`}>
                        {daysLeft <= 0 ? 'Overdue' : `${daysLeft}d left`}
                      </span>
                    ) : (
                      <span className="text-xs text-ghost">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-ghost">No epics found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
