import { useState } from 'react'
import { useTheme } from '../context/ThemeContext'
import { useBoard } from '../context/BoardContext'
import { PRIORITY } from '../constants'
import { formatEstimate } from '../hooks/useFormat'
import { StatusDurationBar } from '../components/StatusDurationBar'

export function EpicsView() {
  const { isDark } = useTheme()
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
      <div className={`shrink-0 px-4 py-3 border-b flex items-center gap-3 ${isDark ? 'border-[#2e303a]' : 'border-gray-200'}`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-[#1e1f25] border-[#2e303a]' : 'bg-white border-gray-200'}`}>
          <span className={`text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>🔍</span>
          <input
            type="text"
            placeholder="Search epics..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`text-[12px] outline-none bg-transparent w-40 ${isDark ? 'text-gray-200 placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
          />
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className={`text-[11px] px-2.5 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-[#1e1f25] border-[#2e303a] text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}>
          <option value="all">Type</option>
          <option value="goal">Goal</option>
          <option value="recurring">Recurring</option>
          <option value="catchall">Catchall</option>
        </select>

        {typeFilter !== 'all' && (
          <button onClick={() => setTypeFilter('all')} className={`text-[11px] px-2 py-1 rounded-md ${isDark ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50'}`}>
            Clear
          </button>
        )}

        <div className="ml-auto">
          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{filtered.length} epics</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ minWidth: 900 }}>
          <thead className="sticky top-0 z-10">
            <tr className={isDark ? 'bg-[#16171d]' : 'bg-gray-50'}>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b w-8 ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`}></th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 260 }}>Epic</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 90 }}>Type</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 100 }}>Items</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 100 }}>Estimate</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 200 }}>Progress</th>
              <th className={`text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-2 border-b ${isDark ? 'text-gray-400 border-[#2e303a]' : 'text-gray-500 border-gray-200'}`} style={{ width: 100 }}>Deadline</th>
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
                  isDark={isDark}
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

function EpicRow({ epic, epicItems, doneItems, totalEstimate, progress, daysUntilDeadline, isExpanded, isDark, onToggle, onSelectItem, statuses }: {
  epic: { id: string; name: string; type: string; color: string; deadline: string | null; description: string }
  epicItems: any[]
  doneItems: any[]
  totalEstimate: number
  progress: number
  daysUntilDeadline: number | null
  isExpanded: boolean
  isDark: boolean
  onToggle: () => void
  onSelectItem: (item: any) => void
  statuses: any[]
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer transition-colors border-b ${isDark ? 'hover:bg-[#1e1f25] border-[#2e303a]' : 'hover:bg-blue-50/40 border-gray-100'}`}
      >
        <td className="px-4 py-2.5">
          <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{isExpanded ? '▾' : '▸'}</span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: epic.color }} />
            <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{epic.name}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
            epic.type === 'recurring' ? isDark ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-green-50 text-green-700 border border-green-200' :
            epic.type === 'goal' ? isDark ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-purple-50 text-purple-700 border border-purple-200' :
            isDark ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>{epic.type}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-[12px] font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            {doneItems.length}<span className={isDark ? 'text-gray-500' : 'text-gray-400'}>/{epicItems.length}</span>
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
            {totalEstimate ? formatEstimate(totalEstimate) : '—'}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#2e303a]' : 'bg-gray-100'}`}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: epic.color }} />
            </div>
            <span className={`text-[11px] font-semibold shrink-0 w-8 text-right ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{progress}%</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          {daysUntilDeadline !== null ? (
            <span className={`text-[11px] font-medium ${daysUntilDeadline <= 0 ? 'text-red-500' : daysUntilDeadline < 7 ? 'text-amber-500' : isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {daysUntilDeadline <= 0 ? 'Overdue' : `${daysUntilDeadline}d left`}
            </span>
          ) : (
            <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>—</span>
          )}
        </td>
      </tr>

      {isExpanded && (
        <>
          {epic.description && (
            <tr className={isDark ? 'bg-[#16171d]' : 'bg-gray-50/50'}>
              <td colSpan={7} className={`px-12 py-2 text-[11px] italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {epic.description}
              </td>
            </tr>
          )}
          {epicItems.length === 0 ? (
            <tr className={isDark ? 'bg-[#16171d]' : 'bg-gray-50/50'}>
              <td colSpan={7} className={`px-12 py-3 text-[12px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No items yet</td>
            </tr>
          ) : (
            <>
              <tr className={isDark ? 'bg-[#13141a]' : 'bg-gray-50'}>
                <td></td>
                <td className={`text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>ID / Work</td>
                <td className={`text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Status</td>
                <td className={`text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Priority</td>
                <td className={`text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Estimate</td>
                <td colSpan={2} className={`text-[10px] font-semibold uppercase tracking-wider px-4 py-1.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>In Status</td>
              </tr>
              {epicItems.map((item) => {
                const priority = PRIORITY[item.priority]
                const status = statuses.find((s: any) => s.id === item.status_id)
                return (
                  <tr
                    key={item.id}
                    onClick={(e) => { e.stopPropagation(); onSelectItem(item) }}
                    className={`cursor-pointer transition-colors border-b ${isDark ? 'hover:bg-[#1e1f25] border-[#2e303a] bg-[#16171d]' : 'hover:bg-blue-50/40 border-gray-100 bg-gray-50/50'}`}
                  >
                    <td></td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono font-medium ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>{item.display_id}</span>
                        <span className={`text-[12px] font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{item.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        status?.is_done
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : isDark ? 'bg-[#2e303a] text-gray-200' : 'bg-gray-100 text-gray-700'
                      }`}>{status?.name}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className="text-[12px] font-bold" style={{ color: priority.color }}>{priority.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[12px] font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
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
          <tr className={`border-b ${isDark ? 'border-[#2e303a] bg-[#16171d]' : 'border-gray-100 bg-gray-50/50'}`}>
            <td></td>
            <td colSpan={6} className="px-4 py-2">
              <button className={`text-[12px] font-medium ${isDark ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-700'}`}>
                + Add item to {epic.name}
              </button>
            </td>
          </tr>
        </>
      )}
    </>
  )
}
