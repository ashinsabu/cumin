import { useState } from 'react'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'
import { FilterSelect } from '../components/FilterSelect'
import { SearchInput } from '../components/SearchInput'

export function EpicsView() {
  const { items, statuses, epics, selectItem } = useBoard()
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const toggleEpic = (id: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

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

        <div className="ml-auto">
          <span className="text-xs text-ghost">{filtered.length} epics</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 900 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-panel">
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b w-8 text-dim border-line"></th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 260 }}>Epic</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 90 }}>Type</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Items</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Estimate</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 200 }}>Progress</th>
              <th className="text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 border-b text-dim border-line" style={{ width: 100 }}>Deadline</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((epic) => {
              const epicItems = items.filter((i) => i.epic_id === epic.id)
              const doneItems = epicItems.filter((i) => statuses.find((s) => s.id === i.status_id)?.is_done)
              const totalEstimate = epicItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
              const doneEstimate = doneItems.reduce((s, i) => s + (i.estimate_minutes || 0), 0)
              const progress = totalEstimate ? Math.round((doneEstimate / totalEstimate) * 100) : 0
              const isExpanded = expandedEpics.has(epic.id)
              const daysUntilDeadline = epic.deadline ? Math.ceil((new Date(epic.deadline).getTime() - Date.now()) / 86400000) : null

              return (
                <EpicRow
                  key={epic.id}
                  epic={epic}
                  epicItems={epicItems}
                  doneItems={doneItems}
                  totalEstimate={totalEstimate}
                  progress={progress}
                  daysUntilDeadline={daysUntilDeadline}
                  isExpanded={isExpanded}
                  onToggle={() => toggleEpic(epic.id)}
                  onSelectItem={selectItem}
                  statuses={statuses}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EpicRow({ epic, epicItems, doneItems, totalEstimate, progress, daysUntilDeadline, isExpanded, onToggle, onSelectItem, statuses }: {
  epic: { id: string; name: string; type: string; color: string; deadline: string | null; description: string }
  epicItems: any[]
  doneItems: any[]
  totalEstimate: number
  progress: number
  daysUntilDeadline: number | null
  isExpanded: boolean
  onToggle: () => void
  onSelectItem: (item: any) => void
  statuses: any[]
}) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer transition-colors border-b hover:bg-surface border-line">
        <td className="px-4 py-2.5">
          <span className="text-xs text-dim">{isExpanded ? '▾' : '▸'}</span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
            <span className="text-sm font-semibold text-ink">{epic.name}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded uppercase ${
            epic.type === 'recurring' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            epic.type === 'goal' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
            'bg-line text-dim border border-line'
          }`}>{epic.type}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm font-medium text-ink/80">
            {doneItems.length}<span className="text-ghost">/{epicItems.length}</span>
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-sm font-semibold text-ink/80">
            {totalEstimate ? formatEstimate(totalEstimate) : '—'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden bg-line">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
            </div>
            <span className="text-xs font-semibold shrink-0 w-8 text-right text-dim">{progress}%</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          {daysUntilDeadline !== null ? (
            <span className={`text-xs font-medium ${daysUntilDeadline <= 0 ? 'text-red-500' : daysUntilDeadline < 7 ? 'text-amber-500' : 'text-ink/80'}`}>
              {daysUntilDeadline <= 0 ? 'Overdue' : `${daysUntilDeadline}d left`}
            </span>
          ) : (
            <span className="text-xs text-ghost">—</span>
          )}
        </td>
      </tr>

      {isExpanded && (
        <>
          {epic.description && (
            <tr className="bg-panel">
              <td colSpan={7} className="px-12 py-2 text-xs italic text-ghost">
                {epic.description}
              </td>
            </tr>
          )}
          {epicItems.length === 0 ? (
            <tr className="bg-panel">
              <td colSpan={7} className="px-12 py-3 text-sm text-ghost">No items yet</td>
            </tr>
          ) : (
            <>
              <tr className="bg-panel">
                <td></td>
                <td className="text-xs font-semibold uppercase tracking-wider px-4 py-1.5 text-ghost">ID / Work</td>
                <td className="text-xs font-semibold uppercase tracking-wider px-4 py-1.5 text-ghost">Status</td>
                <td className="text-xs font-semibold uppercase tracking-wider px-4 py-1.5 text-ghost">Priority</td>
                <td className="text-xs font-semibold uppercase tracking-wider px-4 py-1.5 text-ghost">Estimate</td>
                <td colSpan={2} className="text-xs font-semibold uppercase tracking-wider px-4 py-1.5 text-ghost">In Status</td>
              </tr>
              {epicItems.map((item) => {
                const priority = PRIORITY[item.priority]
                const status = statuses.find((s: any) => s.id === item.status_id)
                return (
                  <tr
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); onSelectItem(item) }}
                    className="cursor-pointer transition-colors border-b hover:bg-surface border-line bg-panel"
                  >
                    <td></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-accent">{item.display_id}</span>
                        <span className="text-sm font-medium truncate text-ink/80">{item.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        status?.is_done
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-line text-ink/80'
                      }`}>{status?.name}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm font-bold" style={{ color: priority.color }}>{priority.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-sm font-semibold text-ink/80">
                        {item.estimate_minutes ? formatEstimate(item.estimate_minutes) : '—'}
                      </span>
                    </td>
                    <td colSpan={2} className="px-4 py-2">
                      <div className="w-28"><StatusDurationBar minutes={item.time_in_status_minutes} /></div>
                    </td>
                  </tr>
                )
              })}
            </>
          )}
          <tr className="border-b border-line bg-panel">
            <td></td>
            <td colSpan={6} className="px-4 py-2">
              <button className="text-sm font-medium text-accent hover:opacity-80">
                + Add item to {epic.name}
              </button>
            </td>
          </tr>
        </>
      )}
    </>
  )
}
